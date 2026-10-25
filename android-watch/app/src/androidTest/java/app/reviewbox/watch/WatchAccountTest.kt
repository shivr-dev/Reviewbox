package app.reviewbox.watch

import android.app.Application
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.CompletableDeferred
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class WatchAccountTest {
    private val instrumentation=InstrumentationRegistry.getInstrumentation()
    private class Client:WatchDeviceClient {
        var failure:Exception?=null
        var statusCalls=0
        val logoutStarted=CompletableDeferred<Unit>()
        val releaseLogout=CompletableDeferred<Unit>()
        override suspend fun authorized(action:String,body:JSONObject):JSONObject {statusCalls++;failure?.let {throw it};return JSONObject()}
        override suspend fun request(action:String,body:JSONObject,token:String?):JSONObject {
            check(action=="logout");logoutStarted.complete(Unit);releaseLogout.await();throw IOException("offline")
        }
    }
    private fun await(condition:()->Boolean) {
        val until=System.currentTimeMillis()+15000
        while(System.currentTimeMillis()<until){var ready=false;instrumentation.runOnMainSync {ready=condition()};if(ready)return;Thread.sleep(50)}
        fail("Timed out")
    }
    private fun model(client:Client):Pair<WatchModel,ViewModelStore> {
        lateinit var model:WatchModel;val holder=ViewModelStore()
        instrumentation.runOnMainSync {
            val app=instrumentation.targetContext.applicationContext as Application
            SecureStore(app).use {it.wipe()}
            model=ViewModelProvider(holder,object:ViewModelProvider.Factory {
                override fun <T:androidx.lifecycle.ViewModel> create(type:Class<T>):T {
                    @Suppress("UNCHECKED_CAST") return WatchModel(app,client) as T
                }
            })[WatchModel::class.java]
        }
        await {!model.busy}
        instrumentation.runOnMainSync {
            model.store.put("session",JSONObject().put("deviceId","test-device").put("access","test-only").toString())
            model.store.put("records","[]");model.store.put("outbox","[]");model.store.put("active-session","{\"queue\":[]}")
            model.go("profile")
        }
        return model to holder
    }
    @Test fun logoutClearsSecretsImmediatelyEvenWhenTheNetworkNeverResponds() {
        val client=Client();val (vm,holder)=model(client)
        try {
            instrumentation.runOnMainSync {vm.logout()}
            await {client.logoutStarted.isCompleted}
            instrumentation.runOnMainSync {
                assertEquals("welcome",vm.page);assertFalse(vm.busy)
                assertNull(vm.store.get("session"));assertNull(vm.store.get("active-session"));assertNull(vm.store.get("outbox"))
                assertTrue(vm.message.contains("已退出"));client.releaseLogout.complete(Unit)
            }
            await {vm.message.contains("网络未确认")}
        } finally {instrumentation.runOnMainSync {holder.clear()}}
    }
    @Test fun temporaryOfflinePreservesAccountButWebRevocationClearsItAndShowsUnbound() {
        val client=Client();val (vm,holder)=model(client)
        try {
            client.failure=IOException("offline")
            instrumentation.runOnMainSync {vm.resume()}
            await {client.statusCalls>0}
            instrumentation.runOnMainSync {assertNotNull(vm.store.get("session"));assertEquals("profile",vm.page);vm.pause()}
            client.failure=DeviceException(401,"Device authorization revoked or expired")
            instrumentation.runOnMainSync {vm.resume()}
            await {vm.page=="welcome"}
            instrumentation.runOnMainSync {
                assertNull(vm.store.get("session"));assertNull(vm.store.get("records"));assertTrue(vm.message.startsWith("已解绑"))
                vm.back();assertEquals("welcome",vm.page)
            }
        } finally {instrumentation.runOnMainSync {holder.clear()}}
    }
}
