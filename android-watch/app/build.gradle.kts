plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}
android {
    namespace = "app.reviewbox.watch"
    compileSdk = 35
    defaultConfig {
        applicationId = "app.reviewbox.watch"
        minSdk = 30
        targetSdk = 35
        versionCode = 6
        versionName = "0.1.5-alpha"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "DEVICE_API", "\"https://svaaepnixdoxubjxqgyr.supabase.co/functions/v1/review-watch\"")
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    lint {
        // Lifecycle 2.9's LiveData detector crashes against AGP 8.7's Kotlin analysis API.
        // This Compose-only app has no MutableLiveData; keep every other release check enabled.
        disable += "NullSafeMutableLiveData"
    }
    buildTypes {
        release { isMinifyEnabled = false }
        create("alpha") {
            initWith(getByName("release"))
            // Test distribution certificate preserves upgrades from 0.1.0. No debug access.
            signingConfig = signingConfigs.getByName("debug")
            isDebuggable = false
            matchingFallbacks += listOf("release")
        }
    }
}
dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.08.00"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.wear.compose:compose-foundation:1.5.0")
    implementation("androidx.wear.compose:compose-material3:1.5.0")
    implementation("androidx.wear.tiles:tiles:1.4.1")
    implementation("androidx.concurrent:concurrent-futures:1.2.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    // Pinned to a binding compatible with the project's Kotlin 2.1 toolchain.
    implementation("io.github.dokar3:quickjs-kt-android:1.0.0-alpha13")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.08.00"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    androidTestImplementation("androidx.test:runner:1.6.2")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
