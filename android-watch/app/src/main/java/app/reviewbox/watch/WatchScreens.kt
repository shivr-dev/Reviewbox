package app.reviewbox.watch

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.SwipeToDismissBox
import org.json.JSONObject

@Composable private fun Orbit(subjects: List<JSONObject>, open: (JSONObject) -> Unit) {
    Canvas(Modifier.size(132.dp)) {
        subjects.forEachIndexed { index, s ->
            val nodes = s.optJSONArray("nodes")?.objects() ?: emptyList()
            val kept = nodes.count { it.optString("status") in listOf("已保持", "已验证") }
            val color = if (nodes.isEmpty()) Color(0xFF294054) else if (kept > 0) Color(0xFF83CC4A) else Blue
            drawArc(color, index * 45f - 88f, 37f, false, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 13.dp.toPx()))
        }
    }
    Copy("知识轨道", Blue, true)
    Copy("每一段代表一个学科；绿色表示已有跨日保持证据。", Muted)
    subjects.forEach { s -> Action(s.getString("name") + " · " + s.getJSONArray("nodes").length() + " 个知识点") { open(s) } }
}

@Composable internal fun WatchApp(vm: WatchModel) {
    val destinations = rememberSaveableStateHolder()
    val haptic = LocalHapticFeedback.current
    LaunchedEffect(vm.feedbackSequence) {
        if (vm.feedbackSequence > 0) haptic.performHapticFeedback(if (vm.feedbackFailure) HapticFeedbackType.Reject else HapticFeedbackType.Confirm)
    }
    BackHandler(vm.page != "welcome" && vm.page != "home") { vm.back() }
    var score by remember(vm.detail) { mutableStateOf("") }
    var maxScore by remember(vm.detail) { mutableStateOf("100") }
    var credits by remember(vm.detail) { mutableStateOf("1") }
    var readerPage by remember(vm.detail) { mutableStateOf(0) }
    var noteText by remember(vm.detail) { mutableStateOf(vm.detail?.optString("body")?:"") }
    val subjects = vm.snapshot.optJSONArray("subjects")?.objects() ?: emptyList()
    val game = vm.snapshot.optJSONObject("game") ?: JSONObject()
    val recommendation = vm.snapshot.optJSONObject("recommendation")
    SwipeToDismissBox(onDismissed = { vm.back() }, userSwipeEnabled = vm.page !in listOf("home", "welcome")) { background ->
        if (background) Box(Modifier.fillMaxSize().background(Night), contentAlignment = Alignment.Center) { Text("返回", color = Blue) }
        else destinations.SaveableStateProvider(vm.page) {
            val question = vm.queue.getOrNull(vm.index)?.optJSONObject("question")
            if (vm.page == "orbit") {
                KnowledgeOrbitScreen(vm)
            } else if (vm.page == "home") {
                WatchHomeScreen(vm)
            } else if (vm.page == "welcome" && vm.error.isBlank()) {
                WatchWelcomeScreen(vm)
            } else if (vm.page == "recall-rating") {
                RecallRatingScreen(vm)
            } else if (vm.page == "question" && question != null && vm.manualQuestion() && !vm.testMode) {
                key(question.getString("id")) { FlashcardScreen(vm, question) }
            } else RoundList(page = vm.page + if (vm.page == "question") vm.index else if (vm.page == "reader") readerPage else "",
                interaction = { vm.touch() },
                back = if (vm.page !in listOf("home", "welcome")) ({ vm.back() }) else null) {
                item { Text(if (vm.demo) "Reviewbox · 演示" else "Reviewbox", color = Blue, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                if (vm.busy) item { Copy("正在处理…", Blue) }
                if (vm.error.isNotEmpty()) item { Copy(vm.error, Color(0xFFFFB9A8)); Action("知道了") { vm.dismiss() } }
                if (vm.message.isNotEmpty()) item { Copy(vm.message, Muted) }
                when (vm.page) {
                    "welcome" -> {
                        item { Penguin(72); Copy("学习，随腕而行", large = true) }
                        item { Copy("连接现有账户，继续你的学习计划。", Muted) }
                        item { Action("连接 Reviewbox 账户", true, !vm.busy) { vm.beginPairing() } }
                        item { Action("先体验演示", enabled = !vm.busy) { vm.startDemo() } }
                    }
                    "pair" -> {
                        item { Copy("在网页批准设备", large = true) }
                        item { Copy(vm.pairing?.optString("userCode")?.chunked(4)?.joinToString(" ") ?: "生成中", Blue, true) }
                        item { Copy("打开 Reviewbox → 我的 → 手表与设备，输入配对码并确认设备。五分钟内有效。", Muted) }
                        item { Copy(vm.pairingStatus, Muted) }
                        item { if (vm.pairingExpired) Action("重新生成配对码", true, !vm.busy) { vm.beginPairing() }
                            else Action(if (vm.busy) "正在连接…" else "检查连接", true, !vm.busy) { vm.claimPairing() } }
                        item { Action("取消配对") { vm.cancelPairing() } }
                    }
                    "home-details" -> {
                        item { Copy(recommendation?.optString("title") ?: "准备好，开始一小段学习", large = true)
                            Text("${recommendation?.optInt("minutes", 5) ?: 5} 分钟 · 按你的学习节奏", color = Muted, fontSize = 12.sp)
                            Action(recommendation?.optString("label", "查看安排") ?: "查看安排", true, !vm.busy) {
                                recommendation?.let { vm.executeAction(it) } ?: vm.go("plan")
                            }
                        }
                        item { Copy(recommendation?.optString("reason") ?: "先连接账户或体验演示内容。", Muted) }
                        if (vm.store.get("active-session") != null) item { NavigationRow("↻", "继续上次学习", "进度已经保存") { vm.resumePractice() } }
                        item { NavigationRow("⊞", "所有功能", "计划、学科、成绩与课程") { vm.go("hub") } }
                        item { NavigationRow("◉", "我的企鹅", "LV ${game.optInt("level", 1)} · ${game.optInt("xp")} XP") { vm.go("profile") } }
                    }
                    "hub" -> {
                        item { Copy("去哪里学习？", large = true) }
                        item { NavigationRow("◷", "学习计划", "本次测试与后续安排") { vm.go("plan") } }
                        item { NavigationRow("▤", "我的学科", "知识点与离线内容") { vm.go("subjects") } }
                        item { NavigationRow("↗", "成绩与 GPA", "真实考试 · 学习报告") { vm.go("results") } }
                        item { NavigationRow("▥", "课程与资料", "接着阅读，慢慢消化") { vm.go("library") } }
                        item { NavigationRow("◎", "知识星环", "看看各学科的保持状态") { vm.go("orbit") } }
                        item { NavigationRow("☆", "本机收藏", "长按题目加入") { vm.go("bookmarks") } }
                        item { NavigationRow("↓", "离线内容", "下载与缓存管理") { vm.go("downloads") } }
                        item { Action("来一道短测", true, !vm.busy) { vm.startPractice(one = true) } }
                    }
                    "question-menu" -> {
                        item { Copy("这道题", large = true); Copy(question?.optString("prompt") ?: "", Muted) }
                        item { NavigationRow("▤", "阅读全文", "长篇内容可自由滚动") { vm.go("question-reader") } }
                        item { NavigationRow("☆", "收藏 / 取消收藏", "保存在此设备，不改变掌握度") { vm.bookmarkCurrent() } }
                        if (vm.revealed && vm.manualQuestion()) item { NavigationRow("✓", "修改自评") { vm.go("recall-rating") } }
                        item { Action("回到题目", true) { vm.returnToQuestion() } }
                        item { Action("保存并退出") { vm.saveAndExit() } }
                    }
                    "recall-rating" -> {
                        item { Copy("回忆得怎样？", large = true); Copy("对照答案后，选择真实感受。", Muted) }
                        item { NavigationRow("○", "忘了", "需要重新理解") { vm.rateRecall("wrong"); vm.returnToQuestion() } }
                        item { NavigationRow("◐", "有些模糊", "还不能独立回忆") { vm.rateRecall("unsure"); vm.returnToQuestion() } }
                        item { NavigationRow("●", "记得", "能够独立回忆") { vm.rateRecall("correct"); vm.returnToQuestion() } }
                        item { Copy("选好后，上滑卡片或点击继续保存。", Muted) }
                    }
                    "question-reader" -> {
                        item { Copy(if (vm.revealed) "答案与讲解" else "读题", large = true) }
                        item { Copy(question?.optString("passage") ?: ""); Copy(question?.optString("prompt") ?: "") }
                        if (vm.revealed) item { Copy("参考答案", Blue); Copy(question?.optString("answer") ?: ""); Copy(question?.optString("explanation") ?: "") }
                        item { Action("回到题目", true) { vm.returnToQuestion() }; Copy("此页上滑只滚动，不切题。", Muted) }
                    }
                    "bookmarks" -> {
                        item { Copy("本机收藏", large = true); Copy("个人收藏保存在本机加密空间。", Muted) }
                        if (vm.bookmarks().isEmpty()) item { Copy("长按题目，留下想再看的内容。", Muted) }
                        items(vm.bookmarks()) { mark -> Copy(mark.optString("title")) }
                    }
                    "plan" -> {
                        item { Copy("学习计划", large = true); Copy("在手表完成测试 · 自动保存与同步", Muted) }
                        if(vm.autoSyncError.isNotEmpty())item { Copy(vm.autoSyncError,Muted) }
                        item { Action("更新学习安排",enabled=!vm.busy&&!vm.demo){vm.sync()} }
                        items(vm.snapshot.optJSONArray("actions")?.objects() ?: emptyList()) { action ->
                            Copy(action.optString("title")); Copy(action.optString("reason"), Muted)
                            Action("查看任务 · ${action.optInt("minutes")} 分钟", enabled = !vm.busy) { vm.detail = action; vm.go("task") }
                        }
                        item { Action("自主选题测试") { vm.go("subjects") }; Action("错题测试", enabled = !vm.busy) { vm.startPractice(wrong = true) } }
                    }
                    "task" -> {
                        item { Copy(vm.detail?.optString("title") ?: "学习任务", large = true); Copy(vm.detail?.optString("reason") ?: "", Muted) }
                        item { Action(vm.detail?.optString("label", "开始任务") ?: "开始任务", true, !vm.busy) { vm.detail?.let { vm.executeAction(it) } } }
                    }
                    "rest" -> item { Penguin(); Copy(vm.detail?.optString("title") ?: "休息一下", large = true); Copy(vm.detail?.optString("reason") ?: "", Muted) }
                    "task-pending" -> item { Copy(vm.detail?.optString("title") ?: "学习任务", large = true); Copy("此任务流程仍在原生端接入中。当前测试版不执行替代练习，也不会伪造完成记录。", Muted) }
                    "subjects" -> items(subjects) { s ->
                        NavigationRow("▤", s.getString("name"), "${s.getJSONArray("nodes").length()} 个知识点") { vm.subject = s.getString("id"); vm.node = ""; vm.go("nodes") }
                    }
                    "nodes" -> {
                        item { Action("我的学习包") { vm.go("downloads") } }
                        item { Action("全学科测试", true, !vm.busy) { vm.node = ""; vm.startPractice() } }
                        items(subjects.find { it.getString("id") == vm.subject }?.getJSONArray("nodes")?.objects() ?: emptyList()) { n ->
                            NavigationRow("◦", n.getString("title"), n.optString("status"), long = { vm.detail = n; vm.go("node-detail") }) { vm.node = n.getString("id"); vm.detail = n; vm.go("node-detail") }
                        }
                    }
                    "node-detail" -> {
                        item { Copy(vm.detail?.optString("title") ?: "知识点", large = true); Copy("长按知识点也可打开此菜单", Muted) }
                        item { Action("选择题", true) { vm.selectedType = "choice"; vm.startPractice() } }
                        item { Action("闪卡") { vm.selectedType = "recall"; vm.startPractice() } }
                        item { Action("看拼音写汉字") { vm.selectedType = "pinyin"; vm.startPractice() } }
                        item { Action("主观题 · 对照自评") { vm.selectedType = "subjective"; vm.startPractice() } }
                        item { Action("全部适用题型") { vm.selectedType = ""; vm.startPractice() } }
                        item { Action("记一条笔记") { vm.detail=null;vm.go("note-edit") } }
                        item { Action("同步最新资料", enabled = !vm.busy && !vm.demo) { vm.sync() } }
                    }
                    "downloads" -> {
                        item { Copy("离线内容", large = true); Copy("我的学习包 · 选择后下载或管理", Muted) }
                        item { NavigationRow("⊕","公共学习包","浏览社区发布的内容") { vm.openPublicPackages() } }
                        val packages=offlinePackages(vm.snapshot,vm.downloads)
                        if(packages.isEmpty())item { Copy("还没有学习包。在网页导入“我的学习包”，同步后即可在这里选择。", Muted) }
                        items(packages) { p ->
                            val installed=vm.downloads.find { it.optString("id",it.optString("subject"))==p.getString("packId") }
                            val status=if(installed==null)"未下载" else if(installed.optString("version")==p.optString("version")&&(p.optString("contentHash").isBlank()||installed.optString("contentHash")==p.optString("contentHash")))"已下载" else "有更新"
                            NavigationRow(if(installed==null)"↓" else "✓",p.optString("title"),status+" · "+p.optInt("questionCount",installed?.optInt("questions")?:0)+" 题") {
                                vm.detail=p;vm.go("offline-package")
                            }
                        }
                        item { Action("同步列表",enabled=!vm.busy&&!vm.demo){vm.sync()} }
                    }
                    "public-packages" -> {
                        item { Copy("公共学习包",large=true);Copy("下载后也会加入你的云端资料库。未核验题可阅读，核验后进入练习。",Muted) }
                        if(vm.publicPackages.isEmpty()&&!vm.busy)item { Copy("暂无缓存内容。联网刷新以查看最新公开学习包。",Muted) }
                        items(vm.publicPackages) { p ->
                            val installed=vm.downloads.find {it.optString("publicId")==p.getString("id")}
                            NavigationRow(if(installed==null)"↓" else "✓",p.getString("title"),"${p.optInt("question_count")} 题 · v${p.optString("version")}") {vm.detail=p;vm.go("public-package")}
                        }
                        item {Action("刷新公共列表",true,!vm.busy&&!vm.demo){vm.loadPublicPackages()}}
                    }
                    "public-package" -> {
                        val p=vm.detail
                        item {Copy(p?.optString("title")?:"公共学习包",large=true);Copy(p?.optString("description")?:"",Muted)}
                        item {Copy("${p?.optInt("question_count")?:0} 题 · v${p?.optString("version")}",Blue)}
                        item {Action("下载并加入资料库",true,!vm.busy&&!vm.demo&&p!=null){vm.downloadPack(p!!.getString("id"),publicPack=true)}}
                        item {Copy("保留已有核验与作答记录。首次下载的题目需要在网页核验；不会自动提高掌握度。",Muted)}
                    }
                    "offline-package", "offline-delete" -> {
                        val id=vm.detail?.optString("packId")?.takeIf { it.isNotBlank() }?:vm.readingPackId
                        val p=offlinePackages(vm.snapshot,vm.downloads).find { it.optString("packId")==id }?:vm.detail
                        val installed=vm.downloads.find { it.optString("id",it.optString("subject"))==id }
                        if(vm.page=="offline-delete") {
                            item { Copy("删除离线副本？",large=true);Copy(p?.optString("title")?:"",Blue) }
                            item { Copy("只清理手表下载内容。网页学习包、作答记录和成绩都会保留。",Muted) }
                            item { Action("确认删除",enabled=!vm.busy&&!vm.demo){vm.removeDownload(id)} }
                            item { Action("保留学习包",true,!vm.busy){vm.back()} }
                        } else {
                            item { Copy(p?.optString("title")?:"学习包",large=true);Copy("版本 "+p?.optString("version","—"),Muted) }
                            item { Copy(if(installed!=null)"已下载 · ${installed.optInt("questions")} 题 · ${installed.optInt("bytes")/1024} KB" else "未下载 · ${p?.optInt("questionCount")?:0} 题",Blue) }
                            if(p?.optBoolean("downloadable",true)==false) item { Copy(p.optString("unavailableReason"),Muted) }
                            item { Action(if(installed==null)"下载到手表" else "更新学习包",true,!vm.busy&&!vm.demo&&p?.optBoolean("downloadable",true)==true){vm.downloadPack(id)} }
                            if(installed!=null)item { Action("删除离线副本",enabled=!vm.busy&&!vm.demo){vm.go("offline-delete")} }
                            if(installed!=null)item { Action("阅读包内题目"){vm.readingPackId=id;vm.go("offline-questions")} }
                            item { Copy("离线可学习；联网后补传进度。未核验题不会进入练习。",Muted) }
                        }
                    }
                    "offline-questions" -> {
                        item {Copy("包内题目",large=true);Copy("只读浏览，不计作答与奖励。",Muted)}
                        items(vm.downloadedQuestions(vm.readingPackId)) { q ->
                            NavigationRow("▤",q.optString("prompt"),if(q.optBoolean("verified"))"已核验" else "待网页核验") {vm.detail=q;vm.go("offline-question-reader")}
                        }
                    }
                    "offline-question-reader" -> {
                        val q=vm.detail
                        item {Copy("题目阅读",large=true);Copy(q?.optString("passage")?:"");Copy(q?.optString("prompt")?:"")}
                        items(q?.optJSONArray("options")?.let {a->(0 until a.length()).map {a.getString(it)}}?:emptyList()){option->Copy(option,Muted)}
                        item {Copy("参考答案",Blue);Copy(q?.optString("answer")?:"");Copy(q?.optString("explanation")?:"",Muted)}
                    }
                    "question" -> {
                        val q = vm.queue.getOrNull(vm.index)?.optJSONObject("question")
                        if (q != null) {
                            item { Copy("${vm.index + 1} / ${vm.queue.size}" + if (vm.testMode) " · 测评" else "", Blue); if (vm.deadline > 0) Copy("限时至 " + java.time.Instant.ofEpochMilli(vm.deadline).atZone(java.time.ZoneId.systemDefault()).toLocalTime().withNano(0), Muted); Copy(q.optString("passage")); Copy(q.getString("prompt")) }
                            if (!vm.revealed) {
                                items(q.optJSONArray("options")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()) { option ->
                                    AnswerOption(option, vm.answer == option) { vm.updateAnswer(option) }
                                }
                                if(q.optString("type")=="matching"&&q.has("matching"))item {MatchingAnswers(vm,q)}
                                else if (q.optString("type") != "choice") item { Input(vm.answer, "你的回答") { vm.updateAnswer(it) } }
                                item { Action(if (vm.testMode) "提交本题" else "检查答案", true, !vm.busy && (!vm.testMode || vm.answer.isNotBlank())) { if (vm.testMode) vm.submit() else vm.reveal() } }
                                if (vm.testMode) item { Action("跳过本题", enabled = !vm.busy) { vm.updateAnswer(""); vm.submit() } }
                            } else {
                                item { Copy("参考答案", Blue); Copy(if(q.optString("type")=="matching") matchingAnswerText(q) else q.getString("answer")); Copy(q.optString("explanation")) }
                                if (q.optString("type") in listOf("choice", "blank", "matching")) item { Action("保存并继续", true, !vm.busy) { vm.submit() } }
                                else item { Copy("对照解析，手动检查", Muted); Action("答对", true, !vm.busy) { vm.submit("correct") }; Action("不确定", enabled = !vm.busy) { vm.submit("unsure") }; Action("答错", enabled = !vm.busy) { vm.submit("wrong") } }
                            }
                            item { Action("更多操作", long = { vm.go("question-menu") }) { vm.go("question-menu") }; Action("保存并退出") { vm.saveAndExit() } }
                        }
                    }
                    "session-finishing" -> {
                        item { Copy("正在保存这一段学习", large = true); Copy("已提交的作答会保留，不需要重新做题。", Muted) }
                        item { Action(if (vm.busy) "正在保存…" else "重试保存", true, !vm.busy) { vm.retryCompletion() } }
                        item { Action("稍后继续", enabled = !vm.busy) { vm.saveAndExit() } }
                    }
                    "summary" -> {
                        item { Penguin(72); Copy("每次回忆，都有意义", large = true); Copy("${vm.queue.size} 道已完成 · ${vm.pending} 条待同步", Muted) }
                        item { Copy("LV ${game.optInt("level", 1)} · ${game.optInt("xp")} XP", Blue, true) }
                        if (vm.testMode) item { Action("查看测评报告", enabled = !vm.busy) { vm.openCurrentReport() } }
                        item { Action("同步学习记录", true, !vm.busy && !vm.demo) { vm.sync() }; Action("返回今天") { vm.go("home") } }
                    }
                    "results" -> {
                        val gpa = vm.snapshot.optJSONObject("gpa")
                        item { Copy("真实 GPA", Blue); Copy(if (gpa == null || gpa.isNull("value")) "尚无真实成绩" else "%.2f / %.1f".format(gpa.getDouble("value"), gpa.getDouble("scale")), large = true) }
                        item { Action("查看 GPA 计算规则") { vm.go("gpa-rules") } }
                        item { Copy("学习 GPA（非学校成绩）", Muted); Copy(vm.snapshot.optJSONObject("weeklyGpa")?.let { if (it.isNull("value")) "样本不足" else it.optString("value") } ?: "样本不足") }
                        items(vm.snapshot.optJSONArray("exams")?.objects() ?: emptyList()) { e ->
                            Action(e.getString("title") + " · " + e.getString("date")) { vm.detail = e; vm.go("exam-detail") }
                        }
                        item { Copy("阶段测评", Blue) }
                        items(vm.snapshot.optJSONArray("tests")?.objects() ?: emptyList()) { t -> Action(t.optString("title", "测评报告"), enabled = !vm.busy) { vm.openReport(t.getString("id")) } }
                    }
                    "gpa-rules" -> {
                        val rules = vm.snapshot.optJSONObject("gpa")
                        item { Copy("GPA 计算规则", large = true); Copy(rules?.optString("formula") ?: "尚未配置"); Copy(if (rules?.optBoolean("weighted") == true) "按学分加权" else "各考试等权", Muted); Copy("在网页版修改规则，手表同步后生效。", Muted) }
                    }
                    "exam-detail" -> {
                        val e = vm.detail
                        item { Copy(e?.optString("title") ?: "考试安排", large = true); Copy("日期：" + e?.optString("date")); Copy("目标得分率：" + e?.optString("target") + "%"); Copy(if (e?.optString("scheduleStatus") == "cancelled") "已取消学习安排，历史成绩保留" else "已加入学习安排", Muted) }
                        val ids = e?.optJSONArray("scope")?.let { a -> (0 until a.length()).map { a.getString(it) }.toSet() } ?: emptySet()
                        item { Copy("考试范围", Blue); Copy(if (ids.isEmpty()) "全学科范围" else subjects.flatMap { it.getJSONArray("nodes").objects() }.filter { it.getString("id") in ids }.joinToString("、") { it.getString("title") }) }
                        item { Action("录入 / 更新实际成绩", enabled = !vm.busy) { vm.go("grade") }; Copy("安排、日期、范围及目标在网页版修改。", Muted) }
                    }
                    "test-report" -> {
                        item { Copy(vm.detail?.optString("title", "测评报告") ?: "测评报告", large = true); Copy("本次表现 " + (vm.detail?.let { if (it.isNull("score")) "尚无有效作答" else "${(it.getDouble("score") * 100).toInt()}%" } ?: "") + " · 与真实 GPA 分开统计", Muted) }
                        items(vm.detail?.optJSONArray("answers")?.objects() ?: emptyList()) { a ->
                            Copy(a.optJSONObject("question")?.optString("prompt") ?: "题目尚未下载，请更新学习包")
                            Copy("你的回答：" + a.optString("answer"), Muted)
                            Copy("参考答案：" + (a.optJSONObject("question")?.optString("answer") ?: "待下载"), Blue)
                            Copy(a.optJSONObject("question")?.optString("explanation") ?: "")
                        }
                    }
                    "grade" -> {
                        item { Copy(vm.detail?.optString("title") ?: "录入成绩", large = true) }
                        item { Input(score, "实际得分") { score = it }; Input(maxScore, "满分") { maxScore = it }; Input(credits, "学分 / 权重") { credits = it } }
                        item { Action("保存真实成绩", true, !vm.busy && score.toDoubleOrNull() != null && maxScore.toDoubleOrNull() != null && credits.toDoubleOrNull() != null) {
                            vm.detail?.let { vm.grade(it, score.toDouble(), maxScore.toDouble(), credits.toDouble()) }
                        } }
                    }
                    "library" -> {
                        item { Copy("课程", Blue) }
                        items(vm.snapshot.optJSONArray("courses")?.objects() ?: emptyList()) { c -> Action(c.optString("title", "课程")) { vm.detail = c; vm.go("course") } }
                        item { Copy("资料与笔记", Blue) }
                        items((vm.snapshot.optJSONArray("materials")?.objects() ?: emptyList()) + (vm.snapshot.optJSONArray("notes")?.objects() ?: emptyList())) { m ->
                            Action(m.optString("name", "学习笔记")) { vm.detail = m; vm.go("reader") }
                        }
                    }
                    "course" -> {
                        item { Copy(vm.detail?.optString("title") ?: "课程", large = true) }
                        val course=vm.detail
                        item { Action("下载 / 更新课程题目",enabled=!vm.busy&&!vm.demo){vm.downloadPack(course!!.getString("id"),course=true)} }
                        items(course?.optJSONArray("sections")?.objects() ?: emptyList()) { section -> Action((if(section.has("completedAt"))"✓ " else "")+section.optString("title", "课程章节")) { vm.openCourseSection(course!!,section) } }
                    }
                    "course-reader" -> {
                        val section=vm.detail
                        item { Copy(section?.optString("title")?:"课程",large=true) }
                        items(section?.optJSONArray("reading")?.let { a->(0 until a.length()).map { a.getString(it) } }?:emptyList()) { block ->
                            Copy(android.text.Html.fromHtml(block,android.text.Html.FROM_HTML_MODE_LEGACY).toString())
                        }
                        items(section?.optJSONArray("checks")?.objects()?:emptyList()) { q ->
                            val passed=section?.optJSONArray("passed")?.let { a->(0 until a.length()).any { a.getString(it)==q.getString("id") } }==true
                            Action((if(passed)"✓ " else "理解检验 · ")+q.optString("prompt"),enabled=!vm.busy){vm.openCourseCheck(q)}
                        }
                        item { Action("完成本节并继续",true,!vm.busy){vm.completeCourseSection()} }
                    }
                    "course-check" -> {
                        val q=vm.detail
                        item { Copy("理解检验",large=true);Copy(q?.optString("prompt")?:"") }
                        if(vm.courseFeedback.isBlank()) {
                            items(q?.optJSONArray("options")?.let { a->(0 until a.length()).map { a.getString(it) } }?:emptyList()) { option ->AnswerOption(option,vm.answer==option){vm.updateAnswer(option)} }
                            item { Action("确认答案",true,!vm.busy&&vm.answer.isNotBlank()){vm.submitCourseCheck()} }
                        } else item { Copy(vm.courseFeedback,Blue);Action("返回课程",true){vm.returnToCourseSection()};Action("重新尝试"){vm.openCourseCheck(q!!)} }
                    }
                    "course-consolidation" -> item {
                        Penguin(64);Copy("讲解完成，动手巩固",large=true)
                        Copy("巩固后安排跨日验证，不跳过必要的学习证据。",Muted)
                        Action("开始课程巩固",true,!vm.busy){vm.startCoursePractice()}
                        Action("稍后继续"){vm.go("plan")}
                    }
                    "note-edit" -> item {
                        Copy("学习笔记",large=true);Input(noteText,"写下你的想法"){noteText=it}
                        Action("保存笔记",true,!vm.busy&&noteText.isNotBlank()){vm.saveNote(noteText,vm.detail?.optString("id"))}
                    }
                    "preferences" -> {
                        item { Copy("学习方式",large=true);Copy("Auto 按计划安排，Guided 引导选择，Manual 自主练习。手表始终由你点击开始。",Muted) }
                        items(listOf("auto" to "自动安排","guided" to "引导学习","manual" to "自主学习")) { (mode,label) ->
                            Action((if(vm.snapshot.optString("mode")==mode)"✓ " else "")+label,enabled=!vm.busy){vm.savePreferences(mode,vm.snapshot.optJSONObject("settings")?.optInt("dailyMinutes",20)?:20)}
                        }
                        item { Copy("每天可用时间",Blue) }
                        items(listOf(5,10,15,20,30,45,60,90)) { minutes ->Action("$minutes 分钟",enabled=!vm.busy){vm.savePreferences(vm.snapshot.optString("mode","guided"),minutes)} }
                    }
                    "reader" -> {
                        val content = vm.detail?.let { it.optString("text", it.optString("body", it.optString("html", ""))) } ?: ""
                        val plain = android.text.Html.fromHtml(content, android.text.Html.FROM_HTML_MODE_LEGACY).toString()
                        val pages = plain.chunked(700).ifEmpty { listOf("此章节内容尚未下载，请同步后重试。") }
                        item { Copy("${readerPage + 1} / ${pages.size}", Blue); Copy(pages[readerPage.coerceIn(pages.indices)]) }
                        item { if(vm.detail?.has("body")==true)Action("编辑笔记"){vm.node=vm.detail!!.optString("nodeId");vm.go("note-edit")}; if (readerPage < pages.lastIndex) Action("下一页", true) { readerPage++ }; if (readerPage > 0) Action("上一页") { readerPage-- } }
                    }
                    "orbit-details" -> item {
                        val o=vm.snapshot.optJSONObject("orbit")
                        Copy("三环，三种真实证据",large=true)
                        Copy("蓝环 · 今日 "+o?.optInt("today")+"/"+o?.optInt("goal")+" 道有效练习",Blue)
                        Copy("绿环 · 覆盖 "+o?.optInt("covered")+"/"+o?.optInt("total")+" 个知识点",Mint)
                        Copy("橙环 · 保持 "+o?.optInt("retained")+"/"+o?.optInt("total")+" 个知识点",Color(0xFFFFBE75))
                        Copy("覆盖表示有过作答；保持要求跨日证据。它们不等于真实成绩或 GPA。",Muted)
                        subjects.forEach { s -> Action(s.getString("name")) { vm.subject=s.getString("id");vm.go("nodes") } }
                    }
                    "profile" -> {
                        item { Penguin(); Copy("LV ${game.optInt("level", 1)} · ${game.optInt("xp")} XP", Blue, true); Copy("${game.optInt("hearts")} / ${game.optInt("maxHearts", 5)} 生命值 · 连续 ${game.optInt("streak")} 天") }
                        item { Copy("最近同步：${vm.store.get("last-sync") ?: "尚未同步"}\n${vm.pending} 条待上传", Muted) }
                        item { Action("立即同步", true, !vm.busy && !vm.demo) { vm.sync() } }
                        item { Action("学习偏好与每日时间") { vm.go("preferences") } }
                        item { Action("账户与设备说明") { vm.go("device-info") } }
                        item { Action("退出账户", enabled = !vm.busy) { vm.go("logout") } }
                    }
                    "device-info" -> item { Copy("OWW231 · Android 11", large = true); Copy("授权可在网页“手表与设备”中撤销。离线记录保存在加密存储中。同步错误不会静默删除待上传记录。", Muted) }
                    "logout" -> {
                        item { Copy("退出并清除手表数据？", large = true); Copy("清除本机账户与离线缓存，并尝试撤销云端授权。${vm.pending} 条待上传记录尚未同步；退出会清除它们。", Muted) }
                        item { Action("同步后再退出", true, !vm.busy && !vm.demo) { vm.sync() } }
                        item { Action("确认退出", enabled = !vm.busy) { vm.logout() }; Action("取消") { vm.back() } }
                    }
                }
                
            }
        }
    }
}
