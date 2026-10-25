package app.reviewbox.watch

import android.app.Application
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class WatchPackageSyncTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private fun await(vm:WatchModel) {
        val until=System.currentTimeMillis()+20000
        while(System.currentTimeMillis()<until){var done=false;instrumentation.runOnMainSync{done=!vm.busy};if(done)return;Thread.sleep(30)}
        fail("Timed out")
    }
    @Test fun syncedPrivateManifestAndPublicDownloadReachTheActualNativeCache() {
        val app=instrumentation.targetContext.applicationContext as Application
        val demo=JSONArray(app.assets.open("demo-records.json").bufferedReader().use{it.readText()}).objects()
        val q=JSONObject(demo.first{it.optString("kind")=="question"&&it.getJSONObject("payload").optString("type")=="choice"}.getJSONObject("payload").toString()).put("verified",false)
        val n=demo.first{it.optString("id")==q.getString("nodeId")}.getJSONObject("payload")
        val manifest=JSONObject().put("id","pack-test").put("title","包名不能丢").put("version","1").put("subject",q.getString("subject"))
            .put("questionIds",JSONArray().put(q.getString("id"))).put("nodeIds",JSONArray().put(n.getString("id")))
        fun row(id:String,kind:String,payload:JSONObject)=JSONObject().put("id",id).put("kind",kind).put("payload",payload).put("updated_at","2026-10-25T12:38:32.613642+00:00").put("deleted",false)
        val pack=JSONObject().put("schemaVersion",1).put("manifest",manifest).put("knowledge",JSONArray().put(n)).put("questions",JSONArray().put(q)).toString()
        var offline=false;var corrupt=false;var pulls=0;var resume=false
        val resumed=JSONObject().put("id","watch-session:test:saved").put("kind","session").put("status","active").put("ownerDeviceId","test")
            .put("mode","test").put("title","已保存的测试").put("createdAt",java.time.Instant.now().toString())
            .put("items",JSONArray().put(JSONObject().put("question",JSONObject(q.toString()).put("verified",true)).put("priority",1).put("reason","恢复")))
        val client=object:WatchDeviceClient {
            override suspend fun request(action:String,body:JSONObject,token:String?)=error("Unexpected raw request")
            override suspend fun authorized(action:String,body:JSONObject):JSONObject {
                if(offline)throw IOException("offline")
                return when(action){
                    "status"->JSONObject().put("generation","generation")
                    "pull"->JSONObject().put("records",if(pulls++==0)JSONArray().put(row("pack:pack-test","pack",manifest)) else JSONArray()).put("hasMore",pulls==1)
                    "public-pack-list"->JSONObject().put("packs",JSONArray().put(JSONObject().put("id","public-id").put("title","公开测试包")))
                    "study-plan"-> {
                        val task=if(resume)JSONObject().put("id","resume:"+resumed.getString("id")).put("kind","resume").put("target",resumed.getString("id")).put("title","已保存的练习").put("questionIds",JSONArray())
                            else JSONObject().put("id","cloud-task").put("kind","rest").put("title","云端更新的学习安排").put("questionIds",JSONArray())
                        JSONObject().put("recommendation",task).put("selected",task).put("actions",JSONArray().put(task))
                            .put("questionRecords",if(resume)JSONArray().put(row(q.getString("id"),"question",JSONObject(q.toString()).put("verified",true))) else JSONArray())
                            .put("taskRecords",if(resume)JSONArray().put(row("active-session","job",resumed)) else JSONArray()).put("computedAt",java.time.Instant.now().toString())
                    }
                    "public-pack-download","download-pack"->JSONObject().put("packageJson",pack).put("sha256",if(corrupt)"bad" else WatchApi.sha(pack)).put("bytes",pack.toByteArray().size).put("records",JSONArray().put(row(n.getString("id"),"node",n)).put(row(q.getString("id"),"question",q)))
                    else->error("Unexpected action $action")
                }
            }
        }
        val holder=ViewModelStore();lateinit var vm:WatchModel
        instrumentation.runOnMainSync {
            SecureStore(app).use{it.wipe();it.put("session","{\"deviceId\":\"test\"}")}
            vm=ViewModelProvider(holder,object:ViewModelProvider.Factory{
                override fun <T:androidx.lifecycle.ViewModel> create(type:Class<T>):T { @Suppress("UNCHECKED_CAST") return WatchModel(app,client) as T }
            })[WatchModel::class.java]
        }
        try {
            await(vm);instrumentation.runOnMainSync{vm.resume()};await(vm)
            instrumentation.runOnMainSync{vm.pause()}
            assertEquals(vm.error,"包名不能丢",vm.snapshot.getJSONArray("packages").getJSONObject(0).getString("title"))
            assertEquals("云端更新的学习安排",vm.snapshot.getJSONObject("recommendation").getString("title"))
            instrumentation.runOnMainSync{vm.openPublicPackages()};await(vm)
            assertEquals("公开测试包",vm.publicPackages[0].getString("title"))
            instrumentation.runOnMainSync{vm.downloadPack("public-id",publicPack=true)};await(vm)
            assertEquals(vm.error,1,vm.downloads.size);assertEquals("pack-test",vm.downloads[0].getString("id"))
            assertTrue(vm.message.contains("0 题可练习"));assertFalse(vm.downloadedQuestions("pack-test")[0].getBoolean("verified"))
            val before=vm.store.get("package:pack-test")
            corrupt=true;instrumentation.runOnMainSync{vm.downloadPack("pack-test")};await(vm)
            assertTrue(vm.error.contains("校验失败"));assertEquals(before,vm.store.get("package:pack-test"))
            offline=true;instrumentation.runOnMainSync{vm.loadPublicPackages()};await(vm)
            assertEquals(1,vm.publicPackages.size);assertEquals(1,vm.downloadedQuestions("pack-test").size)
            instrumentation.runOnMainSync{vm.removeDownload("pack-test")};await(vm)
            assertEquals(0,vm.downloads.size);assertEquals(0,vm.downloadedQuestions("pack-test").size)
            assertNotNull(vm.store.json("session"));assertEquals(1,vm.snapshot.getJSONArray("packages").length())
            offline=false;resume=true
            instrumentation.runOnMainSync{vm.sync()};await(vm)
            assertNotNull("Selected resume target must be cached despite an empty incremental pull",vm.store.array("records").objects().find{it.optJSONObject("payload")?.optString("id")==resumed.getString("id")})
            instrumentation.runOnMainSync{vm.executeAction(vm.snapshot.getJSONObject("recommendation"))};await(vm)
            assertEquals(vm.error,"question",vm.page);assertTrue(vm.testMode);assertEquals(1,vm.queue.size)
            instrumentation.runOnMainSync{vm.updateAnswer(q.getString("answer"));vm.submit()};await(vm)
            assertEquals(vm.error,"summary",vm.page)
            assertNull(vm.store.json("active-session"));assertEquals(1,vm.snapshot.getJSONArray("tests").length())
            assertTrue(vm.store.array("outbox").objects().any{it.optString("kind")=="answer"})
        } finally {instrumentation.runOnMainSync{holder.clear()}}
    }
}
