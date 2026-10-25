package app.reviewbox.watch

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.LocalReduceMotion
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.TextButton
import androidx.wear.compose.material3.TextButtonDefaults
import org.json.JSONObject

/** Reading scrolls within the card; actions remain pinned and never submit a long card by swipe. */
@Composable internal fun FlashcardScreen(vm: WatchModel, question: JSONObject) {
    val id = question.getString("id")
    val haptic = LocalHapticFeedback.current
    val density = LocalDensity.current
    val reduceMotion = LocalReduceMotion.current
    var front by rememberSaveable(id) { mutableStateOf(!vm.revealed) }
    var submitted by remember(id) { mutableStateOf(false) }
    var drag by remember(id) { mutableFloatStateOf(0f) }
    val contentScroll = key(id, front) { rememberScrollState() }
    val longContent by remember(contentScroll) { derivedStateOf { contentScroll.maxValue > 0 } }
    val angle by animateFloatAsState(if (front) 0f else 180f, tween(if (reduceMotion) 0 else 340), label = "flashcard-flip")
    val progress by animateFloatAsState(drag.coerceIn(-80f, 0f), tween(if (reduceMotion) 0 else 120), label = "flashcard-drag")
    val canAdvance = StudyGestures.canAdvance(vm.revealed, vm.selfRating, vm.busy || submitted, reading = false)

    fun flip() {
        if (vm.busy || submitted) return
        haptic.performHapticFeedback(HapticFeedbackType.Confirm)
        if (!vm.revealed) vm.reveal()
        front = !front
    }
    fun advance() {
        if (!StudyGestures.canAdvance(vm.revealed, vm.selfRating, vm.busy || submitted, false)) return
        submitted = true
        haptic.performHapticFeedback(HapticFeedbackType.Confirm)
        vm.submit(vm.selfRating)
    }
    LaunchedEffect(vm.busy, vm.error) { if (!vm.busy && vm.error.isNotEmpty()) submitted = false }
    BoxWithConstraints(Modifier.fillMaxSize().background(Night)) {
        Column(Modifier.fillMaxSize().padding(horizontal = maxWidth * .14f, vertical = maxHeight * .11f),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text("${vm.index + 1} / ${vm.queue.size} · " + if (longContent) "上滑阅读" else if (vm.pinyinQuestion()) "看拼音写汉字" else "对照自评", color = Blue, fontSize = 11.sp)
            val gesture = if (canAdvance && !front && !longContent) Modifier.pointerInput(id, canAdvance, vm.selfRating, longContent) {
                detectVerticalDragGestures(
                    onDragStart = { drag = 0f },
                    onVerticalDrag = { change, amount -> change.consume(); drag += amount / density.density },
                    onDragCancel = { drag = 0f },
                    onDragEnd = {
                        if (StudyGestures.shouldAdvance(drag, vm.revealed, vm.selfRating, vm.busy || submitted, false)) advance()
                        drag = 0f
                    })
            } else Modifier
            Box(Modifier.weight(1f).fillMaxWidth().testTag("flashcard").then(gesture)
                .graphicsLayer { rotationY = angle; cameraDistance = 12 * density.density; translationY = progress * density.density * .18f }
                .clip(RoundedCornerShape(22.dp)).background(if (front) Panel else Color(0xFF163347))
                .border(1.dp, if (front) Color(0xFF35404A) else Blue.copy(alpha = .6f), RoundedCornerShape(22.dp))
                .combinedClickable(onClickLabel = "翻转闪卡", onClick = ::flip, onLongClickLabel = "知识快捷操作",
                    onLongClick = { haptic.performHapticFeedback(HapticFeedbackType.LongPress); vm.go("question-menu") })
                .semantics { stateDescription = if (front) "闪卡正面" else "闪卡答案" }, contentAlignment = Alignment.Center) {
                Column(Modifier.fillMaxSize().testTag("flashcard-text")
                    .graphicsLayer { rotationY = if (angle > 90f) 180f else 0f }
                    .verticalScroll(contentScroll, enabled = longContent).padding(12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = if (longContent) Arrangement.spacedBy(8.dp) else Arrangement.Center) {
                    val showingFront = angle <= 90f
                    if (showingFront && question.optString("passage").isNotBlank())
                        Text(question.optString("passage"), color = Muted, fontSize = 14.sp, lineHeight = 21.sp)
                    if (showingFront && vm.pinyinQuestion())
                        Text("先在纸上或心中写下汉字", color = Blue, fontSize = 11.sp, lineHeight = 16.sp)
                    (if (showingFront) question.optString("prompt") else question.optString("answer")).split("\n\n").forEach { paragraph ->
                        Text(paragraph, color = Ink, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 22.sp, textAlign = TextAlign.Center)
                    }
                    if (!showingFront && question.optString("explanation").isNotBlank())
                        Text(question.optString("explanation"), color = Muted, fontSize = 14.sp, lineHeight = 21.sp)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = {
                    if (vm.revealed) haptic.performHapticFeedback(HapticFeedbackType.Confirm)
                    if (!vm.revealed) flip()
                    else if (vm.selfRating == null) vm.go("recall-rating")
                    else advance()
                }, enabled = !vm.busy && !submitted, modifier = Modifier.weight(1f).heightIn(min = 48.dp),
                    colors = TextButtonDefaults.textButtonColors(containerColor = Color(WatchPalette.Action), contentColor = Ink)) {
                    Text(if (!vm.revealed) "翻面" else if (vm.selfRating == null) "自评" else if (longContent) "继续" else "继续 ↑", fontSize = 14.sp)
                }
                TextButton(onClick = { haptic.performHapticFeedback(HapticFeedbackType.Confirm); vm.go("question-menu") }, modifier = Modifier.width(52.dp).heightIn(min = 48.dp)) {
                    Text("更多", color = Blue, fontSize = 12.sp)
                }
            }

        }
        if (vm.error.isNotBlank()) Column(Modifier.fillMaxSize().background(Night).padding(32.dp), verticalArrangement = Arrangement.Center) {
            Copy(vm.error, Color(0xFFFFB9A8)); Action("重试") { submitted = false; vm.dismiss() }; Action("保存并退出") { vm.saveAndExit() }
        }
    }
}
