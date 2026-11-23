// World Table Games as an Android app: one WebView showing the single exported HTML (copied into
// pages/<edition>/index.html by build-apk.sh). Two flavors share the code: `student` (kr.worldtable.student, the
// student edition) and `full` (kr.worldtable.games, every game). No library beyond the Android platform itself.
import java.util.Properties

plugins {
    id("com.android.application")
}

// Signing comes from the environment (build-apk.sh sets it); without it the release is left unsigned.
val keystore: String? = System.getenv("WTG_KEYSTORE")

android {
    namespace = "kr.worldtable.student"
    compileSdk = 35

    defaultConfig {
        applicationId = "kr.worldtable.student"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("WTG_VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("WTG_VERSION_NAME") ?: "0.1.0"
    }

    signingConfigs {
        if (keystore != null) {
            create("release") {
                storeFile = file(keystore)
                storePassword = System.getenv("WTG_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("WTG_KEY_ALIAS") ?: "student"
                keyPassword = System.getenv("WTG_KEYSTORE_PASSWORD")
            }
        }
    }

    // One app per edition, installable side by side; both are signed with the same key.
    flavorDimensions += "edition"
    productFlavors {
        create("student") {
            dimension = "edition"
            applicationId = "kr.worldtable.student"
        }
        create("full") {
            dimension = "edition"
            applicationId = "kr.worldtable.games"
        }
    }
    // Each edition's page lives outside the sources (it is a build product); main has no assets of its own.
    sourceSets {
        getByName("main").assets.setSrcDirs(listOf<String>())
        getByName("student").assets.setSrcDirs(listOf("../pages/student"))
        getByName("full").assets.setSrcDirs(listOf("../pages/full"))
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystore != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // The page is one large HTML file; keep it stored as it is so that it opens quickly.
    androidResources {
        noCompress += "html"
    }
}
