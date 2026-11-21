// Builds the world map of 대륙 쟁탈전 (src/games/conquest/world-data.ts) from Natural Earth's admin-0 countries,
// which are public domain:
//
//   node scripts/build-world.mjs <ne_50m_admin_0_countries.geojson> [output.ts]
//
// The world is divided our own way: countries are grouped into 48 regions on six continents, and the largest
// countries are cut along straight lines of our own choosing. The outlines are projected (Robinson), simplified with
// Douglas–Peucker while keeping the borders that countries share identical on both sides, rounded to a grid and
// written as compact strings (see `decodeRing` in src/games/conquest/world.ts). Regions are neighbours where their
// countries share a border, or where a cut line runs through a country, and across the sea where `LINKS` says.
// The raw GeoJSON is data only: it is read, never run, and not kept in the repository.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const input = process.argv[2];
const output = resolve(process.argv[3] ?? "src/games/conquest/world-data.ts");
if (!input) {
  console.error("usage: node scripts/build-world.mjs <ne_50m_admin_0_countries.geojson> [output.ts]");
  process.exit(1);
}

/** The plane: COLS × ROWS grid cells (the map board is 16 × 10), UNIT plane units to a cell. */
const COLS = 64,
  ROWS = 40,
  UNIT = 64,
  PW = COLS * UNIT,
  PH = ROWS * UNIT;
/** The central meridian; rings whose middle lies west of SEAM (Chukotka) are carried round to the east. */
const CENTRE = 11,
  SEAM = -169;
/** Sea kept round the land, in projected degrees: left, right, top (the rest goes to the south, under the HUD). */
const MARGIN = { left: 5, right: 4, top: 3 };
/** Douglas–Peucker tolerance and the smallest island kept, in plane units (the painted map has two to a pixel). */
const EPS = 0.75,
  MIN_ISLAND = 70;

const CONTINENTS = [
  { key: "na", name: "북아메리카", label: [-128, 13] },
  { key: "sa", name: "남아메리카", label: [-104, -20] },
  { key: "eu", name: "유럽", label: [-31, 42] },
  { key: "af", name: "아프리카", label: [-12, -4] },
  { key: "as", name: "아시아", label: [74, -6] },
  { key: "oc", name: "오세아니아", label: [125, -45] },
];
/** Regions: key, Korean name, continent, and optionally where its armies stand (longitude, latitude). */
const REGIONS = [
  ["alaska", "알래스카", "na", [-152, 64]],
  ["canadaWest", "캐나다 서부", "na", [-118, 58]],
  ["canadaEast", "캐나다 동부", "na", [-74, 51]],
  ["greenland", "그린란드", "na", [-41, 72]],
  ["usWest", "미국 서부", "na", [-114, 40]],
  ["usCentral", "미국 중부", "na", [-95, 39]],
  ["usEast", "미국 동부", "na", [-81, 37]],
  ["mexico", "멕시코", "na", [-103, 24]],
  ["centralAmerica", "중앙아메리카", "na", [-87.5, 14.5]],
  ["caribbean", "카리브 제도", "na", [-79.5, 22]],
  ["northSouthAmerica", "남미 북부", "sa", [-70, 4]],
  ["amazon", "아마존", "sa", [-60, -5]],
  ["highlands", "브라질 고원", "sa", [-46, -14]],
  ["centralAndes", "중앙 안데스", "sa", [-70, -13]],
  ["southCone", "남미 남부", "sa", [-64, -33]],
  ["british", "브리튼 제도", "eu", [-2.5, 53.5]],
  ["nordic", "북유럽", "eu", [16, 63]],
  ["iberia", "이베리아 반도", "eu", [-4, 40]],
  ["westEurope", "서유럽", "eu", [2.5, 47]],
  ["centralEurope", "중부 유럽", "eu", [15, 50.5]],
  ["southEurope", "남유럽", "eu", [20, 43]],
  ["eastEurope", "동유럽", "eu", [28, 51]],
  ["russiaWest", "러시아 서부", "eu", [45, 58]],
  ["maghreb", "마그레브", "af", [6, 28]],
  ["nile", "나일 강 유역", "af", [30, 20]],
  ["westAfrica", "서아프리카", "af", [-4, 15]],
  ["centralAfrica", "중부 아프리카", "af", [21, 2]],
  ["horn", "아프리카의 뿔", "af", [42, 8]],
  ["eastAfrica", "동아프리카", "af", [35, -6]],
  ["southAfrica", "남부 아프리카", "af", [23, -22]],
  ["middleEast", "중동", "as", [45, 27]],
  ["centralAsia", "중앙아시아", "as", [66, 45]],
  ["southAsia", "남아시아", "as", [78, 22]],
  ["westSiberia", "서시베리아", "as", [76, 62]],
  ["eastSiberia", "동시베리아", "as", [106, 63]],
  ["farEast", "러시아 극동", "as", [142, 64]],
  ["mongolia", "몽골", "as", [103, 47]],
  ["chinaWest", "중국 서부", "as", [86, 36]],
  ["chinaEast", "중국 동부", "as", [113, 31]],
  ["korea", "한반도", "as", [127.5, 37.5]],
  ["japan", "일본", "as", [138.5, 37]],
  ["indochina", "인도차이나 반도", "as", [101, 17]],
  ["malay", "말레이 제도", "as", [114, 0]],
  ["ausWest", "호주 서부", "oc", [121, -25]],
  ["ausCentral", "호주 중부", "oc", [134, -24]],
  ["ausEast", "호주 동부", "oc", [145.5, -26]],
  ["newZealand", "뉴질랜드", "oc", [172, -42]],
  ["newGuinea", "뉴기니", "oc", [143, -6]],
];
/** Crossings by sea: two regions and the coasts the dashes join (longitude, latitude); `wrap` runs off the map's edges. */
const LINKS = [
  ["alaska", "farEast", [-167, 65.6], [-171, 66.2], true], // Bering Strait
  ["canadaEast", "greenland", [-64, 66.5], [-53, 66.5]], // Davis Strait
  ["greenland", "nordic", [-31, 68], [-22.5, 65.6]], // Denmark Strait, to Iceland
  ["british", "westEurope", [1.2, 51.1], [1.8, 50.6]], // the English Channel
  ["british", "nordic", [-1.6, 57.5], [5.4, 58.6]], // the North Sea
  ["iberia", "maghreb", [-5.6, 36.1], [-5.6, 35.6]], // Gibraltar
  ["southEurope", "maghreb", [12.4, 37.8], [11, 37]], // the Strait of Sicily
  ["horn", "middleEast", [43.2, 12.6], [43.6, 13.2]], // Bab-el-Mandeb
  ["highlands", "westAfrica", [-35.2, -5.6], [-17.2, 14.7]], // Natal to Dakar
  ["caribbean", "usEast", [-80.5, 23.1], [-80.6, 25.3]], // the Florida Straits
  ["caribbean", "mexico", [-84.9, 21.9], [-86.8, 21.4]], // the Yucatán Channel
  ["caribbean", "northSouthAmerica", [-70.6, 18.4], [-71.6, 12.3]], // Hispaniola to La Guajira
  ["korea", "japan", [129.2, 35.2], [130.3, 33.7]], // the Korea Strait
  ["japan", "farEast", [141.9, 45.4], [142.1, 46.1]], // La Pérouse Strait, to Sakhalin
  ["chinaEast", "malay", [119.6, 25.4], [120.6, 24.3]], // the Taiwan Strait
  ["malay", "ausCentral", [125.6, -9.2], [130.9, -12.4]], // the Timor Sea
  ["malay", "newGuinea", [129.4, -2.9], [132.3, -2.8]], // Seram to New Guinea
  ["ausEast", "newGuinea", [142.5, -10.7], [142.8, -9.3]], // Torres Strait
  ["ausEast", "newZealand", [151.3, -33.8], [172.7, -40.6]], // the Tasman Sea
];

/**
 * The main mountain ranges, for the painted relief: a height (0 to 1), a half width in degrees, and the line of the
 * crest (longitude, latitude). Real geography, roughly traced; the map's hills between them are painted noise.
 */
const RIDGES = [
  [0.75, 2.2, [-153, 62.5, -147, 63.3, -141, 61]], // Alaska Range
  [0.45, 1.4, [-160, 68, -150, 68.3, -142, 69]], // Brooks Range
  [0.45, 1.5, [-131, 64.5, -126, 62]], // Mackenzie Mountains
  [0.85, 3.6, [-136, 59.5, -125, 54, -118, 50, -113, 46, -110, 43, -107, 39, -106, 35, -105, 31.5]], // the Rockies
  [0.6, 1.6, [-121.5, 48.5, -121.8, 44, -120.5, 39, -118.5, 36]], // Cascades and Sierra Nevada
  [0.55, 2.2, [-108.5, 29.5, -104.5, 24, -102, 20]], // Sierra Madre Occidental
  [0.45, 1.8, [-101, 26, -99, 21.5, -97.5, 18.5]], // Sierra Madre Oriental
  [0.45, 1.4, [-96.5, 17, -91, 15, -86, 13.5, -83.5, 9.5]], // Central American highlands
  [0.35, 2.4, [-85.5, 34, -81, 37, -78, 39.5, -75, 41.5, -72, 44, -69, 46]], // Appalachians
  [0.4, 7, [-42, 64, -40, 70, -40, 77]], // the Greenland ice sheet
  [0.3, 1.6, [-71, 68.5, -66, 66.3]], // Baffin Island
  [0.5, 1.4, [-73.5, 7.5, -70, 9, -66.5, 10.3]], // Venezuelan Andes
  [1, 2.3, [-75.5, 6, -77.8, 0, -79, -5, -76, -11, -72, -15, -68.5, -18, -68, -23, -69.5, -28, -70, -33, -71, -38, -72, -44, -73.2, -49, -72.5, -53]], // the Andes
  [0.6, 3.6, [-69.5, -16, -67.5, -21]], // Altiplano
  [0.32, 3.4, [-45, -20, -42, -15, -40.5, -9.5]], // Brazilian Highlands
  [0.35, 1.4, [-50, -27, -44, -23]], // Serra do Mar
  [0.35, 2.8, [-64, 5.5, -59, 4.5]], // Guiana Highlands
  [0.45, 1.6, [-23, 64.8, -16, 64.8]], // Iceland
  [0.55, 1.9, [6, 59, 8, 61.5, 12, 63.5, 15, 66, 18, 68.5, 21, 69.6]], // the Scandinavian mountains
  [0.45, 1.1, [-5, 37, -3, 37.1]], // Sierra Nevada (Spain)
  [0.4, 1.1, [-7, 43, -4, 43.1]], // Cantabrian Mountains
  [0.6, 0.8, [-1.8, 43, 1, 42.6, 2.8, 42.4]], // the Pyrenees
  [0.85, 1.1, [6, 44.2, 7, 45.8, 9, 46.4, 11, 46.8, 13.5, 47.2, 15.5, 47.4]], // the Alps
  [0.45, 1, [8.5, 44.3, 11, 43.8, 13.5, 42.3, 15.5, 40.5, 16, 38.6]], // the Apennines
  [0.5, 1.4, [14.5, 45.5, 17, 43.8, 19.5, 42.5, 21, 40.5, 22, 39]], // Dinaric Alps and Pindus
  [0.35, 0.9, [22.5, 43.2, 26, 42.7]], // the Balkan Mountains
  [0.5, 1.3, [18, 49.3, 21, 49.4, 24, 48.3, 25.5, 47, 25.5, 45.5, 23, 45.4]], // the Carpathians
  [0.8, 1.3, [38, 44, 41.5, 43.2, 44.5, 42.7, 47.5, 41.5]], // the Caucasus
  [0.4, 1.7, [59, 51.5, 58.7, 55, 59.3, 59, 59.6, 63, 60.5, 66, 64, 68.5]], // the Urals
  [0.5, 1.8, [30, 37, 33, 36.8, 37, 37.8, 41, 38.5, 44, 39.5]], // the Taurus and the Armenian highlands
  [0.4, 1, [35, 41, 41, 40.8]], // Pontic Mountains
  [0.6, 1.9, [45, 36.5, 47, 34, 50, 31.5, 53, 29.5, 56, 27.5]], // the Zagros
  [0.6, 1, [49, 37, 52, 36, 56, 37]], // the Elburz
  [0.35, 1.6, [36, 33.5, 35.5, 31, 35, 28.5, 38, 24, 40.5, 20, 43, 16]], // the Levant and the Hejaz
  [0.9, 2, [65, 34.5, 69, 35.5, 71.5, 36.5, 74, 38.5]], // Hindu Kush and Pamir
  [1, 2.1, [73.5, 35, 77, 33, 80, 30.5, 84, 28.5, 88, 27.8, 92, 27.8, 95.5, 28.5]], // the Himalaya
  [0.8, 5.5, [80, 34, 86, 33.2, 92, 33, 98, 32.5]], // the Tibetan Plateau
  [0.75, 1.5, [77, 36.5, 84, 36, 90, 36, 96, 35.5]], // the Kunlun
  [0.75, 1.7, [69, 41.5, 74, 42, 78, 42, 82, 43, 86, 43.3, 90, 43]], // the Tian Shan
  [0.55, 1.9, [85, 50, 88, 49.5, 91, 48, 95, 46.5, 98, 45.8]], // the Altai
  [0.45, 1.5, [91, 52.5, 97, 52, 101, 51.5]], // the Sayan
  [0.4, 1.9, [97, 47.5, 101, 47]], // the Khangai
  [0.6, 1.9, [98, 28, 99, 25, 101, 23]], // the Hengduan
  [0.4, 1, [104, 34, 110, 33.8]], // the Qinling
  [0.35, 1.1, [104, 19, 106.5, 16, 108, 13]], // the Annamite Range
  [0.35, 0.9, [93.5, 22.5, 94.2, 18]], // the Arakan Yoma
  [0.3, 1, [73.8, 19, 75.5, 13, 77, 9]], // the Western Ghats
  [0.2, 5, [77, 18.5]], // the Deccan
  [0.45, 2, [128, 64, 133, 67, 138, 70]], // the Verkhoyansk Range
  [0.4, 2.4, [142, 65, 148, 66.5, 153, 67.5]], // the Chersky Range
  [0.35, 1.5, [122, 56, 130, 56.3, 136, 57]], // the Stanovoy Range
  [0.55, 1.4, [157, 52, 159, 55, 161, 58]], // Kamchatka
  [0.35, 2, [155, 63, 162, 64.5]], // the Kolyma Mountains
  [0.25, 6, [100, 65, 106, 64]], // the Central Siberian Plateau
  [0.45, 0.9, [130.5, 33, 135, 34.5, 138, 36, 140, 38.5, 141, 41, 142.8, 43.5]], // Japan
  [0.35, 0.9, [127, 40.6, 129, 41.5, 128.6, 38.5, 129, 36.3]], // the Korean mountains
  [0.4, 0.5, [121, 22.5, 121.4, 24.6]], // Taiwan
  [0.35, 1.4, [114, 1.5, 116.5, 5.5]], // Borneo
  [0.4, 0.9, [95.5, 5, 100, -0.5, 103, -4.5]], // Sumatra
  [0.6, 1.4, [134, -3.8, 138, -4.2, 142, -5.5, 146, -6.5]], // the New Guinea Highlands
  [0.6, 1.4, [-9.5, 30.5, -6, 31.8, -3, 33.3, 1, 34.7, 5, 35.5, 8.5, 35.8]], // the Atlas
  [0.4, 2.4, [5.5, 23.5]], // the Ahaggar
  [0.45, 2.1, [18.5, 21]], // the Tibesti
  [0.7, 2.8, [37, 14, 38.5, 11, 39, 8, 37.5, 6.5]], // the Ethiopian Highlands
  [0.55, 1.8, [36, 2, 36.8, -1, 37.3, -3.1]], // the Kenyan highlands
  [0.45, 1.4, [30, 0, 29.5, -3, 30.5, -7, 33.5, -9.5]], // the Western Rift
  [0.35, 1, [9.5, 4, 13, 7]], // the Cameroon line
  [0.5, 1.4, [27, -33, 29, -30, 30.5, -27, 31, -24]], // the Drakensberg
  [0.25, 6.5, [24, -27]], // the southern African plateau
  [0.4, 1, [47, -14, 47, -19, 46, -23]], // Madagascar
  [0.4, 1.4, [145.5, -16, 147, -21, 149.5, -27, 151, -31, 149, -36, 146.5, -37.3]], // the Great Dividing Range
  [0.2, 2, [133, -23.7]], // the MacDonnell Ranges
  [0.7, 0.9, [167.5, -45.5, 170, -43.5, 172.5, -42, 174.5, -41.5, 176, -39]], // the Southern Alps
];

// --- Which countries go where. A rule is a region key, null (left out), "inert" (land that belongs to no region),
// a function of a ring's middle returning one of those, or a split: bands along a value linear in longitude and
// latitude, cut at the given values.
const bands = (by, at, regions) => ({ by, at, regions });
const lonOf = ([lon]) => lon;
/** Russia's longitude with Chukotka carried round past 180°. */
const eastLon = ([lon]) => (lon < -100 ? lon + 360 : lon);
/** Brazil's Amazon lies west of a line from (−46.5°, 0°) to (−58°, −17°): the value is 0 on that line, negative west. */
const brazilSide = ([lon, lat]) => (lon + 46.5) * 17 - lat * 11.5;
const COUNTRIES = {
  // North America
  USA: ([lon, lat]) =>
    lon < SEAM || lon > 0
      ? null
      : lat > 50 && lon < -129
        ? "alaska"
        : lat < 25 && lon < -150
          ? "inert"
          : bands(lonOf, [-101, -88], ["usWest", "usCentral", "usEast"]),
  CAN: bands(lonOf, [-98], ["canadaWest", "canadaEast"]),
  SPM: "canadaEast",
  GRL: "greenland",
  MEX: "mexico",
  BMU: null,
  ...Object.fromEntries(["GTM", "BLZ", "HND", "SLV", "NIC", "CRI", "PAN"].map((c) => [c, "centralAmerica"])),
  ...Object.fromEntries(
    ["CUB", "JAM", "HTI", "DOM", "PRI", "BHS", "TCA", "CYM", "TTO", "ATG", "DMA", "LCA", "VCT", "GRD", "BRB", "KNA", "ABW", "CUW", "AIA", "BLM", "MAF", "MSR", "SXM", "VGB", "VIR"].map((c) => [c, "caribbean"]),
  ),
  // South America
  ...Object.fromEntries(["COL", "VEN"].map((c) => [c, "northSouthAmerica"])),
  ECU: ([lon]) => (lon < -85 ? null : "northSouthAmerica"),
  ...Object.fromEntries(["GUY", "SUR"].map((c) => [c, "amazon"])),
  BRA: bands(brazilSide, [0], ["amazon", "highlands"]),
  ...Object.fromEntries(["PER", "BOL"].map((c) => [c, "centralAndes"])),
  CHL: ([lon]) => (lon < -80 ? null : "southCone"),
  ...Object.fromEntries(["ARG", "PRY", "URY"].map((c) => [c, "southCone"])),
  FLK: "inert",
  // Europe
  ...Object.fromEntries(["GBR", "IRL", "IMN", "GGY", "JEY"].map((c) => [c, "british"])),
  ...Object.fromEntries(["SWE", "FIN", "DNK", "ISL", "FRO", "ALD"].map((c) => [c, "nordic"])),
  NOR: ([, lat]) => (lat < -40 ? null : "nordic"),
  ...Object.fromEntries(["ESP", "PRT", "AND", "GIB"].map((c) => [c, "iberia"])),
  FRA: ([lon, lat]) => (lon > -6 && lon < 10 && lat > 41 && lat < 52 ? "westEurope" : lon > -55 && lon < -51 && lat > 2 && lat < 6 ? "amazon" : null),
  NLD: ([, lat]) => (lat > 50 ? "westEurope" : null),
  ...Object.fromEntries(["BEL", "LUX", "MCO"].map((c) => [c, "westEurope"])),
  ...Object.fromEntries(["DEU", "POL", "CZE", "SVK", "AUT", "HUN", "CHE", "LIE"].map((c) => [c, "centralEurope"])),
  ...Object.fromEntries(["ITA", "SMR", "VAT", "MLT", "SVN", "HRV", "BIH", "SRB", "MNE", "KOS", "ALB", "MKD", "GRC", "BGR"].map((c) => [c, "southEurope"])),
  ...Object.fromEntries(["UKR", "BLR", "LTU", "LVA", "EST", "MDA", "ROU"].map((c) => [c, "eastEurope"])),
  RUS: ([lon, lat]) => (lon > 18 && lon < 23 && lat < 56 ? "eastEurope" : bands(eastLon, [60, 90, 125], ["russiaWest", "westSiberia", "eastSiberia", "farEast"])),
  // Africa
  ...Object.fromEntries(["MAR", "SAH", "DZA", "TUN", "LBY"].map((c) => [c, "maghreb"])),
  ...Object.fromEntries(["EGY", "SDN", "SDS"].map((c) => [c, "nile"])),
  ...Object.fromEntries(["MRT", "MLI", "NER", "SEN", "GMB", "GNB", "GIN", "SLE", "LBR", "CIV", "BFA", "GHA", "TGO", "BEN", "NGA", "CPV"].map((c) => [c, "westAfrica"])),
  ...Object.fromEntries(["TCD", "CMR", "CAF", "GNQ", "GAB", "COG", "COD", "STP"].map((c) => [c, "centralAfrica"])),
  ...Object.fromEntries(["ETH", "ERI", "DJI", "SOM", "SOL"].map((c) => [c, "horn"])),
  ...Object.fromEntries(["KEN", "UGA", "TZA", "RWA", "BDI", "MWI", "MOZ", "MDG", "COM", "MUS", "SYC"].map((c) => [c, "eastAfrica"])),
  ...Object.fromEntries(["AGO", "ZMB", "ZWE", "NAM", "BWA", "ZAF", "LSO", "SWZ"].map((c) => [c, "southAfrica"])),
  // Asia
  ...Object.fromEntries(
    ["TUR", "CYP", "CYN", "GEO", "ARM", "AZE", "SYR", "LBN", "ISR", "PSX", "JOR", "IRQ", "IRN", "SAU", "YEM", "OMN", "ARE", "QAT", "BHR", "KWT"].map((c) => [c, "middleEast"]),
  ),
  ...Object.fromEntries(["KAZ", "UZB", "TKM", "KGZ", "TJK", "AFG"].map((c) => [c, "centralAsia"])),
  ...Object.fromEntries(["IND", "PAK", "BGD", "NPL", "BTN", "LKA", "KAS", "MDV"].map((c) => [c, "southAsia"])),
  MNG: "mongolia",
  CHN: bands(lonOf, [102], ["chinaWest", "chinaEast"]),
  ...Object.fromEntries(["HKG", "MAC"].map((c) => [c, "chinaEast"])),
  ...Object.fromEntries(["KOR", "PRK"].map((c) => [c, "korea"])),
  JPN: "japan",
  ...Object.fromEntries(["MMR", "THA", "LAO", "KHM", "VNM"].map((c) => [c, "indochina"])),
  ...Object.fromEntries(["MYS", "SGP", "BRN", "PHL", "TLS", "TWN"].map((c) => [c, "malay"])),
  IDN: ([lon]) => (lon > 131 ? "newGuinea" : "malay"),
  // Oceania
  AUS: ([lon]) => (lon < 100 ? null : bands(lonOf, [129, 141], ["ausWest", "ausCentral", "ausEast"])),
  NZL: ([lon, lat]) => (lon < 0 || lat < -48 ? null : "newZealand"),
  ...Object.fromEntries(["PNG", "SLB"].map((c) => [c, "newGuinea"])),
  ...Object.fromEntries(["NCL", "VUT", "FJI"].map((c) => [c, "inert"])),
  // Left out: Antarctica, the far southern islands, and the small islands of the open oceans.
  ...Object.fromEntries(
    ["ATA", "ATF", "HMD", "SGS", "SHN", "IOT", "IOA", "ATC", "NFK", "ASM", "COK", "FSM", "GUM", "KIR", "MHL", "MNP", "NIU", "NRU", "PCN", "PLW", "PYF", "TON", "TUV", "WLF", "WSM"].map((c) => [c, null]),
  ),
};

// --- Robinson's projection, by its table, read between rows by Catmull–Rom.
const RX = [1, 0.9986, 0.9954, 0.99, 0.9822, 0.973, 0.96, 0.9427, 0.9216, 0.8962, 0.8679, 0.835, 0.7986, 0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322],
  RY = [0, 0.062, 0.124, 0.186, 0.248, 0.31, 0.372, 0.434, 0.4958, 0.5571, 0.6176, 0.6769, 0.7346, 0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1];
function table(list, lat) {
  const t = Math.min(17.9999, Math.abs(lat) / 5),
    i = Math.floor(t),
    f = t - i,
    p0 = list[Math.max(0, i - 1)],
    p1 = list[i],
    p2 = list[i + 1],
    p3 = list[Math.min(18, i + 2)];
  return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
}
/**
 * Magnifying lenses over the crowded parts of the world (Europe, the Caribbean, the seas round Korea and Japan): within
 * an ellipse of half axes rx, ry (projected degrees) a point moves out from the centre by 1 + k(1 − s²)², s its
 * distance in the ellipse's measure. With k under 1.25 the lens never folds, so borders stay borders.
 */
const LENSES = [
  { at: [14, 50], rx: 46, ry: 30, k: 0.75 },
  { at: [-79, 18], rx: 20, ry: 14, k: 0.55 },
  { at: [131, 37], rx: 15, ry: 13, k: 0.55 },
];
/**
 * Robinson's projection flattens the far north; the north is let out a little upward (by up to STRETCH more, eased
 * in between y = 22 and y = 62 projected degrees), which also uses more of the board.
 */
const STRETCH = 0.55;
function stretch(y) {
  if (y <= 22) return y;
  const w = 40,
    u = Math.min(1, (y - 22) / w);
  return y + STRETCH * (w * (u ** 3 - u ** 4 / 2) + Math.max(0, y - 62));
}
const robinson = (lon, lat) => [table(RX, lat) * (lon - CENTRE), stretch(Math.sign(lat) * table(RY, lat) * 91.2989)];
const lenses = LENSES.map((l) => ({ ...l, c: robinson(l.at[0], l.at[1]) }));
/** A point in projected degrees: x along the equator, y up. */
function project(lon, lat) {
  let [x, y] = robinson(lon, lat);
  for (const { c, rx, ry, k } of lenses) {
    const u = (x - c[0]) / rx,
      v = (y - c[1]) / ry,
      s2 = u * u + v * v;
    if (s2 >= 1) continue;
    const f = 1 + k * (1 - s2) ** 2;
    x = c[0] + (x - c[0]) * f;
    y = c[1] + (y - c[1]) * f;
  }
  return [x, y];
}

// --- Read the countries.
const geo = JSON.parse(readFileSync(input, "utf8"));
const regionIndex = new Map(REGIONS.map(([key], i) => [key, i]));
const unknown = new Set();
/** Every ring kept: its country, what it belongs to, its points (longitude, latitude) and whether it is a hole. */
const rings = [];
const middle = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
for (const feature of geo.features) {
  const code = feature.properties.ADM0_A3;
  if (!(code in COUNTRIES)) {
    unknown.add(code);
    continue;
  }
  const rule = COUNTRIES[code];
  if (rule === null) continue;
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const polygon of polygons) {
    let parent = -1;
    polygon.forEach((raw, k) => {
      const pts = raw.slice();
      if (pts.length > 1 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop();
      if (k > 0 && parent < 0) return;
      const c = middle(pts),
        wrapped = c[0] < SEAM;
      const target = typeof rule === "function" ? rule(c) : rule;
      if (target === null) return;
      if (typeof target === "string" && target !== "inert" && !regionIndex.has(target)) throw new Error(`unknown region ${target}`);
      rings.push({ code, target, pts, hole: k > 0, parent: k > 0 ? parent : -1, wrapped });
      if (k === 0) parent = rings.length - 1;
    });
  }
}
if (unknown.size) console.warn("countries not placed (left out):", [...unknown].join(" "));

// --- Shared points: a key for every point, the same for a border on both sides (and for ±180°).
const keyOf = ([lon, lat]) => `${(lon === -180 ? 180 : lon).toFixed(6)},${lat.toFixed(6)}`;
const owners = new Map();
rings.forEach((ring, r) => {
  ring.keys = ring.pts.map(keyOf);
  for (const k of ring.keys) {
    let set = owners.get(k);
    if (!set) owners.set(k, (set = new Set()));
    set.add(r);
  }
});
for (const ring of rings) ring.shared = ring.keys.some((k) => owners.get(k).size > 1);

// --- Projection, and islands too small to show left out (a ring that shares a border is always kept).
for (const ring of rings) ring.xy = ring.pts.map(([lon, lat]) => project(ring.wrapped ? lon + 360 : lon, lat));
const areaOf = (xy) => {
  let a = 0;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) a += (xy[j][0] - xy[i][0]) * (xy[j][1] + xy[i][1]);
  return Math.abs(a / 2);
};
let minX = Infinity,
  maxX = -Infinity,
  minY = Infinity,
  maxY = -Infinity;
// A first scale from the extent of everything, to judge islands by their size on the plane.
for (const ring of rings) for (const [x, y] of ring.xy) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x)), (minY = Math.min(minY, y)), (maxY = Math.max(maxY, y));
let scale = PW / (maxX - minX + MARGIN.left + MARGIN.right);
for (const ring of rings) ring.keep = ring.shared || areaOf(ring.xy) * scale * scale >= MIN_ISLAND;
for (const ring of rings) if (ring.hole && !rings[ring.parent].keep) ring.keep = false;
const kept = rings.filter((r) => r.keep);
minX = minY = Infinity;
maxX = maxY = -Infinity;
for (const ring of kept) for (const [x, y] of ring.xy) (minX = Math.min(minX, x)), (maxX = Math.max(maxX, x)), (minY = Math.min(minY, y)), (maxY = Math.max(maxY, y));
const width = maxX - minX + MARGIN.left + MARGIN.right,
  left = minX - MARGIN.left,
  top = maxY + MARGIN.top;
scale = PW / width;
const bottom = top - PH / scale;
if (bottom > minY) throw new Error(`the land does not fit: ${bottom} > ${minY}`);
/** A projected point on the plane, y down. */
const toPlane = ([x, y]) => [(x - left) * scale, (top - y) * scale];
const lonLatToPlane = (lon, lat) => toPlane(project(lon < SEAM ? lon + 360 : lon, lat));

// --- Simplification that keeps shared borders identical: points where the set of rings changes are fixed, and the
// stretches between them are simplified once, the same way from whichever side they are met.
function dp(points, eps) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a],
      [bx, by] = points[b],
      dx = bx - ax,
      dy = by - ay,
      len = Math.hypot(dx, dy);
    let far = -1,
      most = eps;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i],
        d = len > 1e-12 ? Math.abs(dx * (py - ay) - dy * (px - ax)) / len : Math.hypot(px - ax, py - ay);
      if (d > most) {
        most = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return keep;
}
const signature = (k) => [...owners.get(k)].filter((r) => rings[r].keep).sort((a, b) => a - b).join(",");
const runs = new Map();
const eps = EPS / scale;
for (const ring of kept) {
  const n = ring.pts.length,
    sig = ring.keys.map(signature),
    fixed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const before = sig[(i - 1 + n) % n],
      after = sig[(i + 1) % n];
    if (sig[i] !== before || sig[i] !== after || sig[i].split(",").length > 2) fixed[i] = 1;
  }
  let first = fixed.indexOf(1);
  if (first < 0) {
    // An island alone: its first point and the point furthest from it.
    first = 0;
    let far = 0,
      most = -1;
    ring.xy.forEach(([x, y], i) => {
      const d = Math.hypot(x - ring.xy[0][0], y - ring.xy[0][1]);
      if (d > most) (most = d), (far = i);
    });
    fixed[0] = fixed[far] = 1;
  }
  const keep = new Uint8Array(n);
  // Walk the ring from fixed point to fixed point.
  let a = first;
  do {
    let b = (a + 1) % n;
    while (!fixed[b]) b = (b + 1) % n;
    const idx = [];
    for (let i = a; ; i = (i + 1) % n) {
      idx.push(i);
      if (i === b && idx.length > 1) break;
    }
    // The same stretch from the other side runs the other way: simplify it in one direction only.
    const forward = ring.keys[idx[0]] < ring.keys[idx.at(-1)] || (ring.keys[idx[0]] === ring.keys[idx.at(-1)] && ring.keys[idx[1]] < ring.keys[idx.at(-2)]);
    const ordered = forward ? idx : [...idx].reverse(),
      id = `${ordered.length}|${ordered.map((i) => ring.keys[i]).join(";")}`;
    let mask = runs.get(id);
    if (!mask) runs.set(id, (mask = dp(ordered.map((i) => ring.xy[i]), eps)));
    ordered.forEach((i, j) => mask[j] && (keep[i] = 1));
    a = b;
  } while (a !== first);
  ring.simple = ring.pts.flatMap((p, i) => (keep[i] ? [{ p, xy: ring.xy[i] }] : []));
}

// --- Cutting the large countries: each ring clipped to every band, the cut lines followed a degree at a time.
function clip(points, value, bound, keepAbove) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length],
      vp = value(p),
      vq = value(q),
      inP = keepAbove ? vp >= bound : vp < bound,
      inQ = keepAbove ? vq >= bound : vq < bound;
    if (inP) out.push(p);
    if (inP !== inQ) {
      const t = (bound - vp) / (vq - vp);
      out.push({ ...p, cut: bound, p: [p.p[0] + (q.p[0] - p.p[0]) * t, p.p[1] + (q.p[1] - p.p[1]) * t] });
    }
  }
  return out;
}
function densify(points, value) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length];
    out.push(p);
    if (p.cut !== undefined && q.cut === p.cut) {
      const steps = Math.floor(Math.hypot(q.p[0] - p.p[0], q.p[1] - p.p[1]));
      for (let s = 1; s < steps; s++) out.push({ p: [p.p[0] + ((q.p[0] - p.p[0]) * s) / steps, p.p[1] + ((q.p[1] - p.p[1]) * s) / steps] });
    }
  }
  return out;
}
/** Pieces of every region: rings of plane points. */
const pieces = REGIONS.map(() => []),
  inert = [];
const cutNeighbours = new Set();
const pair = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const planeOf = (ring, pts) => pts.map(({ p }) => toPlane(project(ring.wrapped ? p[0] + 360 : p[0], p[1])));
for (const ring of kept) {
  const pts = ring.simple.map(({ p }) => ({ p }));
  if (ring.target === "inert") inert.push(planeOf(ring, pts));
  else if (typeof ring.target === "string") pieces[regionIndex.get(ring.target)].push(planeOf(ring, pts));
  else {
    const { by, at, regions } = ring.target,
      value = (q) => by(q.p),
      found = [];
    regions.forEach((key, band) => {
      let part = pts;
      if (band > 0) part = clip(part, value, at[band - 1], true);
      if (band < at.length) part = clip(part, value, at[band], false);
      if (part.length < 3) return;
      const plane = planeOf(ring, densify(part, value));
      if (areaOf(plane) < 0.5) return;
      pieces[regionIndex.get(key)].push(plane);
      found.push(band);
    });
    for (let k = 1; k < found.length; k++) if (found[k] === found[k - 1] + 1) cutNeighbours.add(pair(regionIndex.get(regions[found[k]]), regionIndex.get(regions[found[k - 1]])));
  }
}

// --- Neighbours by land: two regions whose countries share a stretch of border (judged by where that stretch lies,
// for the countries that are cut), or the two sides of a cut.
function regionAt(ring, lonLat) {
  const t = ring.target;
  if (typeof t === "string") return t === "inert" ? -1 : regionIndex.get(t);
  const v = t.by(lonLat);
  let band = 0;
  while (band < t.at.length && v >= t.at[band]) band++;
  return regionIndex.get(t.regions[band]);
}
const edges = new Map();
for (const ring of kept) {
  const n = ring.pts.length;
  for (let i = 0; i < n; i++) {
    const a = ring.keys[i],
      b = ring.keys[(i + 1) % n];
    if (a === b) continue;
    const id = a < b ? `${a}|${b}` : `${b}|${a}`,
      mid = [(ring.pts[i][0] + ring.pts[(i + 1) % n][0]) / 2, (ring.pts[i][1] + ring.pts[(i + 1) % n][1]) / 2],
      region = regionAt(ring, mid);
    let list = edges.get(id);
    if (!list) edges.set(id, (list = []));
    list.push({ region, code: ring.code });
  }
}
const land = new Set(cutNeighbours);
for (const list of edges.values())
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) if (list[i].region >= 0 && list[j].region >= 0 && list[i].region !== list[j].region) land.add(pair(list[i].region, list[j].region));

// --- Rounding, and the check that nothing was lost.
const roundRing = (ring) => {
  const out = [];
  for (const [x, y] of ring) {
    const X = Math.round(x),
      Y = Math.round(y);
    if (out.length && out.at(-2) === X && out.at(-1) === Y) continue;
    out.push(X, Y);
  }
  if (out.length >= 4 && out[0] === out.at(-2) && out[1] === out.at(-1)) out.splice(-2);
  return out;
};
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** A ring as text: each coordinate's step from the last, zigzagged, in five-bit groups (a sixth bit says "more"). */
function encode(flat) {
  let out = "",
    px = 0,
    py = 0;
  for (let i = 0; i < flat.length; i += 2) {
    for (const d of [flat[i] - px, flat[i + 1] - py]) {
      let z = d < 0 ? -2 * d - 1 : 2 * d;
      do {
        const chunk = z & 31;
        z >>>= 5;
        out += ALPHABET[chunk | (z ? 32 : 0)];
      } while (z);
    }
    px = flat[i];
    py = flat[i + 1];
  }
  return out;
}
const regionRings = pieces.map((list) => list.map(roundRing).filter((r) => r.length >= 6));
const inertRings = inert.map(roundRing).filter((r) => r.length >= 6);

// --- Even–odd scanline fill, for the places of the armies and the checks.
function fill(ringsList, w, h, k) {
  const mask = new Uint8Array(w * h),
    rows = Array.from({ length: h }, () => []);
  for (const flat of ringsList) {
    const n = flat.length / 2;
    for (let i = 0; i < n; i++) {
      const x1 = flat[2 * i] / k,
        y1 = flat[2 * i + 1] / k,
        x2 = flat[(2 * i + 2) % flat.length] / k,
        y2 = flat[(2 * i + 3) % flat.length] / k;
      if (y1 === y2) continue;
      const lo = Math.max(0, Math.ceil(Math.min(y1, y2) - 0.5)),
        hi = Math.min(h - 1, Math.ceil(Math.max(y1, y2) - 0.5) - 1);
      for (let y = lo; y <= hi; y++) {
        const yc = y + 0.5;
        rows[y].push(x1 + ((yc - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
  }
  rows.forEach((xs, y) => {
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.max(0, Math.ceil(xs[i] - 0.5)),
        b = Math.min(w - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
      for (let x = a; x <= b; x++) mask[y * w + x] ^= 1;
    }
  });
  return mask;
}
const R = 4,
  RW = PW / R,
  RH = PH / R;
const masks = regionRings.map((list) => fill(list, RW, RH, R));
const areas = masks.map((m) => m.reduce((s, v) => s + v, 0) / (UNIT / R) ** 2);
/** Where a region's armies stand: the given place, or the point of it furthest inside. */
const anchors = REGIONS.map(([key, , , at], r) => {
  if (at) {
    const [x, y] = lonLatToPlane(at[0], at[1]);
    const inside = masks[r][Math.floor(y / R) * RW + Math.floor(x / R)];
    if (!inside) console.warn(`the place of ${key} is outside it`);
    return [x / UNIT, y / UNIT];
  }
  const m = masks[r],
    d = new Float32Array(RW * RH);
  for (let i = 0; i < d.length; i++) d[i] = m[i] ? 1e9 : 0;
  for (let y = 0; y < RH; y++)
    for (let x = 0; x < RW; x++) {
      const i = y * RW + x;
      if (!m[i]) continue;
      d[i] = Math.min(d[i], x ? d[i - 1] + 1 : 1, y ? d[i - RW] + 1 : 1);
    }
  for (let y = RH - 1; y >= 0; y--)
    for (let x = RW - 1; x >= 0; x--) {
      const i = y * RW + x;
      if (!m[i]) continue;
      d[i] = Math.min(d[i], x < RW - 1 ? d[i + 1] + 1 : 1, y < RH - 1 ? d[i + RW] + 1 : 1);
    }
  let best = 0;
  for (let i = 0; i < d.length; i++) if (d[i] > d[best]) best = i;
  return [((best % RW) + 0.5) / (UNIT / R), (Math.floor(best / RW) + 0.5) / (UNIT / R)];
});

// --- Sea links and their checks.
const links = LINKS.map(([a, b, from, to, wrap]) => {
  const ia = regionIndex.get(a),
    ib = regionIndex.get(b);
  if (ia === undefined || ib === undefined) throw new Error(`unknown link ${a}–${b}`);
  if (land.has(pair(ia, ib))) console.warn(`${a}–${b} are neighbours by land already`);
  const [fx, fy] = lonLatToPlane(from[0], from[1]),
    [tx, ty] = lonLatToPlane(to[0], to[1]);
  return { a: ia, b: ib, from: [fx / UNIT, fy / UNIT], to: [tx / UNIT, ty / UNIT], wrap: !!wrap };
});
const neighbours = REGIONS.map(() => new Set());
for (const id of land) {
  const [a, b] = id.split(":").map(Number);
  neighbours[a].add(b);
  neighbours[b].add(a);
}
for (const l of links) neighbours[l.a].add(l.b), neighbours[l.b].add(l.a);
// Everything reached from the first region, and every continent whole by itself.
const reach = (from, allowed) => {
  const seen = new Set([from]),
    queue = [from];
  for (let q = 0; q < queue.length; q++) for (const n of neighbours[queue[q]]) if (!seen.has(n) && allowed(n)) seen.add(n), queue.push(n);
  return seen;
};
const continentOf = REGIONS.map(([, , c]) => CONTINENTS.findIndex((x) => x.key === c));
if (reach(0, () => true).size !== REGIONS.length) throw new Error("not every region can be reached");
CONTINENTS.forEach((c, i) => {
  const members = REGIONS.map((_, r) => r).filter((r) => continentOf[r] === i);
  if (reach(members[0], (n) => continentOf[n] === i).size !== members.length) throw new Error(`${c.name} is not whole`);
});
// Regions that come close across the water without a crossing, for the one who edits LINKS to judge.
const ids = new Int16Array(RW * RH).fill(-1);
masks.forEach((m, r) => m.forEach((v, i) => v && (ids[i] = r)));
const close = new Map();
for (let i = 0; i < ids.length; i++) {
  const a = ids[i];
  if (a < 0) continue;
  const x = i % RW,
    y = (i - x) / RW;
  if (!(x > 0 && ids[i - 1] < 0) && !(x < RW - 1 && ids[i + 1] < 0) && !(y > 0 && ids[i - RW] < 0) && !(y < RH - 1 && ids[i + RW] < 0)) continue;
  for (let dy = -6; dy <= 6; dy++)
    for (let dx = -6; dx <= 6; dx++) {
      const X = x + dx,
        Y = y + dy;
      if (X < 0 || Y < 0 || X >= RW || Y >= RH) continue;
      const b = ids[Y * RW + X];
      if (b < 0 || b === a || neighbours[a].has(b)) continue;
      const id = pair(a, b),
        d = Math.hypot(dx, dy);
      if (!(close.get(id) <= d)) close.set(id, d);
    }
}
const near = [...close].map(([id, d]) => `${id.split(":").map((r) => REGIONS[r][0]).join("–")} ${d.toFixed(1)}`);
if (near.length) console.log("close but not joined (raster px at quarter scale):", near.join(", "));
// The corner kept for the players' figures: the lower left 23% by 26%.
let cornerLand = 0;
for (const m of masks)
  for (let y = Math.floor(RH * 0.74); y < RH; y++) for (let x = 0; x < Math.floor(RW * 0.23); x++) cornerLand += m[y * RW + x];
console.log(`land in the lower left corner: ${cornerLand} px (quarter scale)`);

// --- Writing it out.
const round2 = (v) => Math.round(v * 100) / 100;
const counts = CONTINENTS.map((_, i) => continentOf.filter((c) => c === i).length);
let vertices = 0;
for (const list of regionRings) for (const r of list) vertices += r.length / 2;
for (const r of inertRings) vertices += r.length / 2;
const text = `// Generated by scripts/build-world.mjs from Natural Earth admin-0 countries (1:50m, public domain; see
// public/map-license.txt). Do not edit by hand: change the script and run it again.
//
// The plane is WORLD_COLS × WORLD_ROWS grid cells; outlines are in WORLD_UNIT-ths of a cell, as text that
// \`decodeRing\` in ./world.ts reads. Places (x, y) are in cells. Regions are numbered in the order given here.

export const WORLD_COLS = ${COLS},
  WORLD_ROWS = ${ROWS},
  WORLD_UNIT = ${UNIT};
/** The continents: name, and where its name and bonus are written in the sea. */
export const WORLD_CONTINENTS: { name: string; x: number; y: number }[] = ${JSON.stringify(
  CONTINENTS.map((c) => {
    const [x, y] = lonLatToPlane(c.label[0], c.label[1]);
    return { name: c.name, x: round2(x / UNIT), y: round2(y / UNIT) };
  }),
)};
/** The regions: name, continent, where the armies stand, its area in cells, and its outlines. */
export const WORLD_REGIONS: { name: string; continent: number; x: number; y: number; area: number; rings: string[] }[] = [
${REGIONS.map(
  ([, name], r) =>
    `  ${JSON.stringify({ name, continent: continentOf[r], x: round2(anchors[r][0]), y: round2(anchors[r][1]), area: round2(areas[r]), rings: regionRings[r].map(encode) })},`,
).join("\n")}
];
/** Neighbours by land, region by region. */
export const WORLD_LAND: number[][] = ${JSON.stringify(REGIONS.map((_, r) => [...neighbours[r]].filter((n) => land.has(pair(r, n))).sort((a, b) => a - b)))};
/** Crossings by sea: the two regions, the coasts the dashes join, and whether they run off the map's sides. */
export const WORLD_LINKS: { a: number; b: number; from: [number, number]; to: [number, number]; wrap: boolean }[] = ${JSON.stringify(
  links.map((l) => ({ a: l.a, b: l.b, from: l.from.map(round2), to: l.to.map(round2), wrap: l.wrap })),
)};
/** Mountain ranges for the painted relief: height, half width in cells, and the crest's points in cells. */
export const WORLD_RIDGES: [number, number, number[]][] = ${JSON.stringify(
  RIDGES.map(([h, w, line]) => {
    const pts = [];
    for (let i = 0; i < line.length; i += 2) {
      const [x, y] = lonLatToPlane(line[i], line[i + 1]);
      pts.push(round2(x / UNIT), round2(y / UNIT));
    }
    return [h, round2((w * scale) / UNIT), pts];
  }),
)};
/** Land that belongs to no region (far islands): drawn, never played. */
export const WORLD_INERT: string[] = ${JSON.stringify(inertRings.map(encode))};
`;
writeFileSync(output, text);
console.log(
  `${output}: ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB, ${REGIONS.length} regions (${CONTINENTS.map((c, i) => `${c.name} ${counts[i]}`).join(", ")}), ${vertices} points, ${land.size} borders by land, ${links.length} by sea`,
);
for (const [r, [key, name]] of REGIONS.entries()) console.log(`${String(r).padStart(2)} ${key.padEnd(18)} ${name.padEnd(10)} area ${areas[r].toFixed(1).padStart(6)} land: ${[...neighbours[r]].filter((n) => land.has(pair(r, n))).map((n) => REGIONS[n][0]).join(" ")}`);
