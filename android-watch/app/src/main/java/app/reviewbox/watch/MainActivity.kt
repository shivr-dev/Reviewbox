package app.reviewbox.watch

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.wear.compose.material3.AppScaffold

class MainActivity : ComponentActivity() {
    private lateinit var model: WatchModel
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        model = ViewModelProvider(this)[WatchModel::class.java]
        setContent { ReviewWatchTheme { AppScaffold { WatchApp(model) } } }
        if(intent.getBooleanExtra("glance",false)) launchGlance()
    }
    override fun onNewIntent(intent: android.content.Intent) { super.onNewIntent(intent);setIntent(intent);if(intent.getBooleanExtra("glance",false))launchGlance() }
    private fun launchGlance() { lifecycleScope.launch { while(model.busy)delay(100);if(model.store.get("active-session")!=null)model.resumePractice() else if(model.demo||model.store.json("session")!=null){model.subject="all";model.node="";model.selectedType="";model.startPractice(one=true)} } }
    override fun onStop() { if (::model.isInitialized) model.pause(); super.onStop() }
    override fun onStart() { super.onStart(); if (::model.isInitialized) model.resume() }
}
