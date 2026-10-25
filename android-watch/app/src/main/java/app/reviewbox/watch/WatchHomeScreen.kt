package app.reviewbox.watch

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.TextButton
import androidx.wear.compose.material3.TextButtonDefaults

/** A single-screen launch surface: current action is always visible without scrolling. */
@Composable internal fun WatchHomeScreen(vm: WatchModel) {
    val haptic = LocalHapticFeedback.current
    val task = vm.snapshot.optJSONObject("recommendation")
    val saved = vm.store.get("active-session") != null
    BoxWithConstraints(Modifier.fillMaxSize().background(Night)) {
        Column(Modifier.fillMaxSize().padding(horizontal = maxWidth * .14f, vertical = maxHeight * .115f),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(Modifier.height(42.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Penguin(42)
                Column {
                    Text("Reviewbox", color = Blue, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    Text(if (vm.demo) "演示 · ${task?.optInt("minutes", 5) ?: 5} 分钟" else "${task?.optInt("minutes", 5) ?: 5} 分钟 · 为你安排", color = Muted, fontSize = 10.sp)
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text(if (saved) "接着上次的学习" else task?.optString("title") ?: "开始一小段学习", color = Ink,
                    modifier = Modifier.verticalScroll(rememberScrollState()),
                    fontSize = 16.sp, lineHeight = 21.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            }
            Action(if (vm.busy) "正在准备…" else if (saved) "继续学习" else task?.optString("label", "查看安排") ?: "查看安排", true, !vm.busy) {
                if (saved) vm.resumePractice() else task?.let { vm.executeAction(it) } ?: vm.go("plan")
            }
            Row(Modifier.fillMaxWidth().height(38.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                TextButton(onClick = { haptic.performHapticFeedback(HapticFeedbackType.Confirm); vm.go("home-details") }, modifier = Modifier.weight(1f).fillMaxHeight(), colors = TextButtonDefaults.textButtonColors(contentColor = Blue)) {
                    Text(if (vm.error.isNotBlank()) "查看问题" else "安排说明", color = if (vm.error.isNotBlank()) androidx.compose.ui.graphics.Color(0xFFFFB9A8) else Muted, fontSize = 11.sp)
                }
                TextButton(onClick = { haptic.performHapticFeedback(HapticFeedbackType.Confirm); vm.go("hub") }, modifier = Modifier.weight(1f).fillMaxHeight(), colors = TextButtonDefaults.textButtonColors(contentColor = Blue)) {
                    Text("所有功能", color = Blue, fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable internal fun RecallRatingScreen(vm: WatchModel) {
    BoxWithConstraints(Modifier.fillMaxSize().background(Night)) {
        Column(Modifier.fillMaxSize().padding(horizontal = maxWidth * .16f, vertical = maxHeight * .11f),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("回忆得怎样？", color = Ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            listOf("忘了" to "wrong", "有些模糊" to "unsure", "记得" to "correct").forEach { (label, value) ->
                Action(label, primary = value == "correct", enabled = !vm.busy) { vm.rateRecall(value); vm.returnToQuestion() }
            }
        }
    }
}

@Composable internal fun WatchWelcomeScreen(vm: WatchModel) {
    BoxWithConstraints(Modifier.fillMaxSize().background(Night)) {
        Column(Modifier.fillMaxSize().padding(horizontal = maxWidth * .13f, vertical = maxHeight * .11f),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { Penguin(52) }
            Text("学习，随腕而行", color = Ink, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            if(vm.message.isNotBlank())Text(vm.message,color=Muted,fontSize=11.sp)
            Action(if (vm.busy) "正在准备…" else "连接账户", true, !vm.busy) { vm.beginPairing() }
            Action("先体验演示", enabled = !vm.busy) { vm.startDemo() }
        }
    }
}
