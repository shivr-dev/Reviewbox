package app.reviewbox.watch

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import java.io.File

/** Runs against the real native UI and shared engine on an Android round-screen emulator. */
class WatchGestureTest {
    @get:Rule val ui = createAndroidComposeRule<MainActivity>()
    private lateinit var vm: WatchModel
    private fun ready() { ui.waitUntil(30000) { !vm.busy } }
    private fun shot(name: String) {
        ui.waitForIdle()
        val registry = InstrumentationRegistry.getInstrumentation()
        val file = File(registry.targetContext.filesDir, "screenshots/$name.png").apply { parentFile!!.mkdirs() }
        ui.onRoot().captureToImage().asAndroidBitmap().let { image -> file.outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) } }
    }
    @Test fun flashcardGesturesPreserveExplicitEvidenceAndSavedProgress() {
        ui.runOnUiThread { vm = ViewModelProvider(ui.activity)[WatchModel::class.java] }
        ready()
        ui.runOnUiThread { vm.startDemo() }; ready()
        assertTrue(vm.demo)
        ui.runOnUiThread {
            val rows=vm.store.array("demo-records")
            rows.objects().filter { it.optString("kind")=="question" && it.getJSONObject("payload").optString("type")=="recall" }.forEach { it.getJSONObject("payload").put("prompt","回忆这条知识").put("answer","答案").put("explanation","") }
            vm.store.put("demo-records",rows.toString())
        }
        shot("01-home")
        ui.runOnUiThread { vm.subject = "math"; vm.node = ""; vm.selectedType = "recall"; vm.startPractice() }; ready()
        assertEquals(vm.error, "question", vm.page)
        assertTrue(vm.queue.size >= 2)
        shot("02-flashcard-front")
        val initialIndex = vm.index
        ui.onNodeWithTag("flashcard").performTouchInput { swipeUp() }
        assertEquals(initialIndex, vm.index)
        ui.onNodeWithTag("flashcard").performClick()
        ui.waitUntil { vm.revealed }
        ui.onNodeWithTag("flashcard").performTouchInput { swipeUp() }
        assertEquals("Swiping does not invent a self rating", initialIndex, vm.index)
        shot("03-flashcard-answer")
        ui.onNodeWithTag("flashcard").performTouchInput { longClick() }
        ui.waitUntil { vm.page == "question-menu" }
        shot("04-quick-actions")
        ui.runOnUiThread { vm.returnToQuestion() }
        ui.onNodeWithText("自评").performClick()
        ui.waitUntil { vm.page == "recall-rating" }
        // All three explicit ratings are visible without scrolling.
        ui.onNodeWithText("忘了").assertIsDisplayed()
        ui.onNodeWithText("忘了").performClick()
        ui.waitUntil { vm.page == "question" && vm.selfRating == "wrong" }
        shot("05-rated-card")
        ui.onNodeWithTag("flashcard").performTouchInput { swipeUp() }
        ready()
        assertEquals(initialIndex + 1, vm.index)
        val events = vm.store.array("demo-records").objects().filter { it.optString("kind") == "event" }
        assertEquals("wrong", events.last().getJSONObject("payload").getString("outcome"))
        ui.runOnUiThread { vm.go("question-reader") }
        ui.onRoot().performTouchInput { swipeUp() }
        assertEquals(initialIndex + 1, vm.index)
        shot("06-reading")
        ui.onRoot().performTouchInput { swipe(Offset(1f, centerY), Offset(width - 1f, centerY), 500) }
        ui.waitUntil(5000) { vm.page == "question" }
        assertEquals(initialIndex + 1, vm.index)
        ui.runOnUiThread { vm.saveAndExit() }
        ui.waitUntil { vm.page == "home" }
        assertNotNull(vm.store.json("active-session"))
        ui.runOnUiThread { vm.resumePractice() }; ready()
        assertEquals(initialIndex + 1, vm.index)
        val original=vm.store.json("active-session")!!.getString("id")
        ui.runOnUiThread {vm.updateAnswer("保存的回答");vm.saveAndExit()}
        val resume=vm.snapshot.getJSONArray("actions").objects().find { it.optString("kind")=="resume"&&it.optString("target")==original }!!
        ui.runOnUiThread { vm.executeAction(resume) };ready()
        assertEquals("Director resume must restore the saved answer","保存的回答",vm.answer)
        assertEquals(original,vm.store.json("active-session")!!.getString("id"))
        ui.runOnUiThread { vm.saveAndExit();vm.store.remove("active-session");vm.executeAction(resume) };ready()
        assertEquals(vm.error,"question",vm.page)
        assertEquals("Original next unanswered question",initialIndex+1,vm.index)
        assertEquals(original,vm.store.json("active-session")!!.getString("id"))
        ui.runOnUiThread { vm.saveAndExit(); vm.go("results") }
        shot("07-results")
        ui.runOnUiThread { vm.back(); vm.go("subjects") }
        shot("08-subjects")
    }

    @Test fun longPinyinTextScrollsWithoutLosingThePinnedActionsOrSubmitting() {
        ui.runOnUiThread { vm=ViewModelProvider(ui.activity)[WatchModel::class.java] };ready()
        ui.runOnUiThread { vm.startDemo() };ready()
        ui.runOnUiThread {
            val rows=vm.store.array("demo-records")
            val original=rows.objects().first { it.optString("kind")=="question"&&it.getJSONObject("payload").optString("subject")=="chinese" }
            val q=original.getJSONObject("payload")
            q.put("type","pinyin").put("prompt","看拼音写汉字\n\n"+"阅读说明，认真回忆。".repeat(45)+"\n\n阅读终点：shǒu qū yī zhǐ")
            q.put("answer","首屈一指").put("explanation","形容位居第一，出类拔萃。".repeat(20))
            vm.store.put("demo-records",rows.toString());vm.subject="chinese";vm.node="";vm.selectedType="pinyin";vm.startPractice(one=true)
        };ready()
        assertEquals(vm.error,"question",vm.page);assertTrue(vm.manualQuestion());assertTrue(vm.pinyinQuestion())
        ui.onNodeWithText("翻面").assertIsDisplayed()
        ui.onNodeWithText("阅读终点：shǒu qū yī zhǐ",useUnmergedTree=true).performScrollTo().assertIsDisplayed()
        assertEquals(0,vm.index);assertFalse(vm.revealed)
        shot("10-pinyin-long")
        ui.onNodeWithText("翻面").performClick();ui.waitUntil {vm.revealed}
        ui.runOnUiThread {vm.rateRecall("wrong")}
        ui.onNodeWithTag("flashcard-text",useUnmergedTree=true).performTouchInput {swipeUp()}
        assertEquals("Reading a long answer never submits it",0,vm.index)
        ui.onNodeWithText("继续").assertIsDisplayed();shot("11-pinyin-answer")
        ui.onNodeWithText("继续").performClick();ready()
        assertEquals(vm.error,"summary",vm.page)
        ui.runOnUiThread {vm.go("orbit")};shot("12-knowledge-rings")
        ui.onNodeWithText("查看环详情").assertIsDisplayed()
    }

    @Test fun completedSessionCannotReappearAsUnfinishedWhenLeavingSummary() {
        ui.runOnUiThread { vm = ViewModelProvider(ui.activity)[WatchModel::class.java] }; ready()
        ui.runOnUiThread { vm.startDemo() }; ready()
        ui.runOnUiThread { vm.subject = "math"; vm.node = ""; vm.selectedType = "choice"; vm.startPractice(one = true) }; ready()
        assertEquals(vm.error, "question", vm.page)
        ui.runOnUiThread { vm.updateAnswer(vm.queue[0].getJSONObject("question").getString("answer")); vm.reveal(); vm.submit() }; ready()
        assertEquals(vm.error, "summary", vm.page)
        assertNull(vm.store.json("active-session"))
        ui.runOnUiThread { vm.back(); vm.saveAndExit() }
        assertNull("Completed evidence must not revive an active task", vm.store.json("active-session"))
        ui.onNodeWithText("所有功能").assertIsDisplayed()
        shot("09-home-finished")
    }

    @Test fun offlineContentsUsesASeparatePackageDetailAndLogoutShowsTheConnectionScreen() {
        ui.runOnUiThread {vm=ViewModelProvider(ui.activity)[WatchModel::class.java]};ready()
        ui.runOnUiThread {
            vm.store.put("downloaded-packs","[{\"id\":\"math-pack\",\"title\":\"代数巩固学习包\",\"version\":\"1.0\",\"questions\":24,\"bytes\":24576,\"questionIds\":[]}]")
            vm.startDemo()
        };ready()
        ui.runOnUiThread {
            vm.snapshot.put("packages",org.json.JSONArray("[{\"packId\":\"math-pack\",\"title\":\"代数巩固学习包\",\"version\":\"1.1\",\"questionCount\":26,\"downloadable\":true}]") )
            vm.go("downloads")
        }
        ui.onNodeWithText("代数巩固学习包").performScrollTo().performClick()
        ui.waitUntil {vm.page=="offline-package"}
        ui.onNodeWithText("已下载 · 24 题 · 24 KB").performScrollTo().assertIsDisplayed()
        shot("13-offline-package")
        ui.onNodeWithText("更新学习包").performScrollTo().assertIsNotEnabled()
        ui.runOnUiThread {vm.go("offline-delete")}
        ui.onNodeWithText("删除离线副本？").assertIsDisplayed();shot("14-offline-delete")
        ui.onNode(hasScrollToIndexAction()).performScrollToNode(hasText("保留学习包"))
        ui.onNodeWithText("保留学习包").performClick()
        assertEquals("offline-package",vm.page)
        ui.runOnUiThread {vm.logout()}
        ui.waitUntil {vm.page=="welcome"}
        ui.onNodeWithText("连接账户").assertIsDisplayed();ui.onNodeWithText("先体验演示").assertIsDisplayed()
        shot("15-signed-out")
    }
}
