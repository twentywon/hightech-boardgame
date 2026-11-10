shader_type spatial;
render_mode diffuse_burley;
varying vec3 local_position;
void vertex() { local_position = VERTEX; }
void fragment() {
    vec2 p = local_position.xz;
    float wave = p.x * 7.0 + sin(p.y * 0.38) * 2.0 + sin(p.y * 1.2 + p.x) * 0.22;
    float grain = sin(wave * 4.0) * 0.006 + sin(wave * 17.0) * 0.002;
    float broad = sin(wave * 0.55) * 0.018;
    ALBEDO = vec3(0.15, 0.075, 0.035) + vec3(broad + grain) * vec3(1.0, 0.68, 0.39);
    ROUGHNESS = 0.38;
    SPECULAR = 0.35;
}
