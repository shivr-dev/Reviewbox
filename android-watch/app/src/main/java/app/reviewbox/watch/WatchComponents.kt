package app.reviewbox.watch

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.rotary.onPreRotaryScrollEvent
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.*
import androidx.wear.compose.material3.*
import androidx.wear.compose.material3.lazy.TransformationSpec
import androidx.wear.compose.material3.lazy.rememberTransformationSpec
import androidx.wear.compose.material3.lazy.transformedHeight

@Composable internal fun AnswerOption(label: String, selected: Boolean, click: () -> Unit) {
    val color by animateColorAsState(if (selected) Color(0xFF204762) else Panel, label = "answer-selection")
    val haptic = LocalHapticFeedback.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(color)
        .border(if (selected) 2.dp else 1.dp, if (selected) Blue else Color(0xFF35404A), RoundedCornerShape(18.dp))
        .combinedClickable(role = Role.RadioButton, onClick = { haptic.performHapticFeedback(HapticFeedbackType.Confirm); click() })
        .semantics { this.selected = selected }
        .padding(12.dp).heightIn(min = 28.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(if (selected) "●" else "○", color = Blue, fontSize = 18.sp)
        Text(label, color = Ink, fontSize = 15.sp, lineHeight = 22.sp, modifier = Modifier.weight(1f))
    }
}

internal val Ink = Color(WatchPalette.Text)
internal val Muted = Color(WatchPalette.Secondary)
internal val Blue = Color(WatchPalette.Brand)
internal val Night = Color(WatchPalette.Background)
internal val Panel = Color(WatchPalette.Surface)
internal val Mint = Color(0xFFB9E89D)

@Composable internal fun ReviewWatchTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = ColorScheme(
        primary = Blue, onPrimary = Night, primaryContainer = Color(0xFF153A55), onPrimaryContainer = Ink,
        background = Night, onBackground = Ink, surfaceContainer = Panel,
        surfaceContainerLow = Color(0xFF101317), surfaceContainerHigh = Color(0xFF272D33),
        onSurface = Ink, onSurfaceVariant = Muted, error = Color(0xFFFFB9A8)
    ), content = content)
}

@Composable internal fun Action(label: String, primary: Boolean = false, enabled: Boolean = true, long: (() -> Unit)? = null, click: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    Button(onClick = { haptic.performHapticFeedback(HapticFeedbackType.Confirm); click() },
        onLongClick = long?.let { { haptic.performHapticFeedback(HapticFeedbackType.LongPress); it() } },
        onLongClickLabel = if (long != null) "更多操作" else null,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), enabled = enabled,
        colors = ButtonDefaults.buttonColors(containerColor = if (primary) Color(WatchPalette.Action) else Panel, contentColor = Ink)) {
        Text(label, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, fontSize = 14.sp, lineHeight = 19.sp,
            fontWeight = if (primary) FontWeight.Bold else FontWeight.Medium)
    }
}

@Composable internal fun Copy(text: String, color: Color = Ink, large: Boolean = false) {
    if (text.isNotBlank()) Text(text, color = color, fontSize = if (large) 21.sp else 14.sp,
        lineHeight = if (large) 26.sp else 21.sp, fontWeight = if (large) FontWeight.Bold else FontWeight.Normal,
        textAlign = if (large) TextAlign.Center else TextAlign.Start, modifier = Modifier.fillMaxWidth())
}

@Composable internal fun Input(value: String, label: String, change: (String) -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = Muted, fontSize = 12.sp)
        BasicTextField(value = value, onValueChange = change, textStyle = TextStyle(color = Ink, fontSize = 16.sp), cursorBrush = SolidColor(Blue),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).background(Panel, RoundedCornerShape(14.dp)).border(1.dp, Color(0xFF48505C), RoundedCornerShape(14.dp)).padding(12.dp))
    }
}

@Composable internal fun Penguin(size: Int = 76) {
    val context = LocalContext.current
    val bitmap = remember(context) { context.assets.open("penguin.png").use { BitmapFactory.decodeStream(it).asImageBitmap() } }
    Image(bitmap, "企鹅伙伴", Modifier.size(size.dp).background(Color(0xFFE9F4FA), CircleShape).padding(4.dp))
}

/** Every lazy item has one layout root; transformations never distort individual text lines. */
internal class RoundListScope(private val list: TransformingLazyColumnScope, private val spec: TransformationSpec) {
    fun item(content: @Composable ColumnScope.() -> Unit) {
        list.item {
            val surface = SurfaceTransformation(spec)
            Column(Modifier.fillMaxWidth().transformedHeight(this, spec).graphicsLayer { with(surface) { applyContentTransformation() } },
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
        }
    }
    fun <T> items(rows: List<T>, content: @Composable ColumnScope.(T) -> Unit) { rows.forEach { row -> item { content(row) } } }
}

@Composable internal fun RoundList(page: String, back: (() -> Unit)? = null, interaction: () -> Unit = {}, content: RoundListScope.() -> Unit) {
    // Preserve scroll per destination; entering a question starts at its own top.
    key(page) {
        val list = rememberTransformingLazyColumnState()
        val spec = rememberTransformationSpec()
        val notify by rememberUpdatedState(interaction)
        BoxWithConstraints(Modifier.fillMaxSize().background(Night).onPreRotaryScrollEvent { notify(); false }
            .pointerInput(page) {
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        if (event.changes.any { it.pressed }) notify()
                    }
                }
            }) {
            val padding = PaddingValues(horizontal = maxWidth * .12f, vertical = maxHeight * .16f)
            if (back != null) {
                ScreenScaffold(scrollState = list, contentPadding = padding, edgeButton = {
                    EdgeButton(onClick = back) { Text("返回", color = Night) }
                }) { safe -> TransformingLazyColumn(state = list, contentPadding = safe, verticalArrangement = Arrangement.spacedBy(12.dp)) { RoundListScope(this, spec).content() } }
            } else {
                ScreenScaffold(scrollState = list, contentPadding = padding) { safe ->
                    TransformingLazyColumn(state = list, contentPadding = safe, verticalArrangement = Arrangement.spacedBy(12.dp)) { RoundListScope(this, spec).content() }
                }
            }
        }
    }
}

@Composable internal fun NavigationRow(symbol: String, title: String, subtitle: String = "", long: (() -> Unit)? = null, click: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Panel)
        .combinedClickable(onClick = { haptic.performHapticFeedback(HapticFeedbackType.Confirm); click() },
            onLongClickLabel = if (long != null) "快捷操作" else null,
            onLongClick = long?.let { { haptic.performHapticFeedback(HapticFeedbackType.LongPress); it() } }).padding(12.dp).heightIn(min = 28.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(30.dp).background(Color(0xFF263B49), CircleShape), contentAlignment = Alignment.Center) {
            Icon(when (symbol) {
                "↻" -> Icons.Default.Refresh
                "▤", "▥" -> Icons.Default.List
                "↗" -> Icons.Default.Star
                "☆" -> Icons.Default.Favorite
                "◷" -> Icons.Default.DateRange
                "◉" -> Icons.Default.AccountCircle
                "✓", "●" -> Icons.Default.Check
                "↓" -> Icons.Default.KeyboardArrowDown
                else -> Icons.Default.Menu
            }, contentDescription = null, tint = Blue, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, color = Ink, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 19.sp)
            if (subtitle.isNotBlank()) Text(subtitle, color = Muted, fontSize = 11.sp, lineHeight = 16.sp)
        }
    }
}
