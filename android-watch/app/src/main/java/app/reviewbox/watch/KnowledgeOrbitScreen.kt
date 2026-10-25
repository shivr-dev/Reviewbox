package app.reviewbox.watch

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.LocalReduceMotion
import androidx.wear.compose.material3.Text

/** Independent rings represent observed counts, never fabricated mastery probabilities. */
@Composable internal fun KnowledgeOrbitScreen(vm: WatchModel) {
    val orbit=vm.snapshot.optJSONObject("orbit")
    val today=orbit?.optInt("today")?:0; val goal=orbit?.optInt("goal",10)?:10
    val covered=orbit?.optInt("covered")?:0; val total=orbit?.optInt("total")?:0
    val retained=orbit?.optInt("retained")?:0
    val values=listOf(today.toFloat()/goal.coerceAtLeast(1),covered.toFloat()/total.coerceAtLeast(1),retained.toFloat()/total.coerceAtLeast(1))
    val colors=listOf(Color(0xFF58BDF8),Color(0xFFB2E874),Color(0xFFFFBE75))
    val reduce=LocalReduceMotion.current
    var entered by remember { mutableStateOf(false) }
    LaunchedEffect(Unit){entered=true}
    val a by animateFloatAsState(if(entered)values[0].coerceIn(0f,1f) else 0f,tween(if(reduce)0 else 800),label="daily-ring")
    val b by animateFloatAsState(if(entered)values[1].coerceIn(0f,1f) else 0f,tween(if(reduce)0 else 950),label="coverage-ring")
    val c by animateFloatAsState(if(entered)values[2].coerceIn(0f,1f) else 0f,tween(if(reduce)0 else 1100),label="retention-ring")
    BoxWithConstraints(Modifier.fillMaxSize().background(Night)) {
        Column(Modifier.fillMaxSize().padding(horizontal=maxWidth*.15f,vertical=maxHeight*.105f),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(3.dp)) {
            Text("知识环",color=Ink,fontSize=15.sp)
            Box(Modifier.weight(1f).fillMaxWidth(),contentAlignment=Alignment.Center) {
                Canvas(Modifier.size(123.dp).semantics { contentDescription="今日学习 $today / $goal；已覆盖 $covered / $total；已保持 $retained / $total。详情可点击下方按钮。" }) {
                    listOf(a,b,c).forEachIndexed { i,value ->
                        val inset=(5+i*16).dp.toPx();val diameter=size.minDimension-inset*2
                        val stroke=Stroke(width=10.dp.toPx(),cap=StrokeCap.Round)
                        drawArc(colors[i].copy(alpha=.16f),-90f,360f,false,Offset(inset,inset),Size(diameter,diameter),style=stroke)
                        if(value>0)drawArc(colors[i],-90f,value*359.8f,false,Offset(inset,inset),Size(diameter,diameter),style=stroke)
                    }
                }
                Penguin(36)
            }
            Text("今日 $today/$goal · 保持 $retained/$total",color=Blue,fontSize=10.sp)
            Action("查看环详情",true){vm.go("orbit-details")}
        }
    }
}
