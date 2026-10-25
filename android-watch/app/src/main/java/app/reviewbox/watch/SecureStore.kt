package app.reviewbox.watch

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject
import org.json.JSONArray

/** Every value, including records and the offline outbox, is encrypted with an app-only Keystore key. */
class SecureStore(context: Context) : SQLiteOpenHelper(context, "reviewbox-private.db", null, 1) {
    private val alias = "reviewbox-watch-account-v1"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return (store.getKey(alias, null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
            generateKey()
        }
    }
    override fun onCreate(db: SQLiteDatabase) { db.execSQL("create table private_values(id text primary key, value blob not null)") }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, next: Int) { error("Unsupported protected storage version") }
    @Synchronized fun get(id: String): String? {
        readableDatabase.rawQuery("select value from private_values where id=?", arrayOf(id)).use { cursor ->
            if (!cursor.moveToFirst()) return null
            val bytes = cursor.getBlob(0)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
            cipher.updateAAD(id.toByteArray(Charsets.UTF_8))
            return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
        }
    }
    @Synchronized fun put(id: String, value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key()); cipher.updateAAD(id.toByteArray(Charsets.UTF_8))
        val bytes = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        writableDatabase.execSQL("insert or replace into private_values(id,value) values(?,?)", arrayOf(id, bytes))
    }
    @Synchronized fun remove(id: String) { writableDatabase.delete("private_values", "id=?", arrayOf(id)) }
    @Synchronized fun transaction(block: () -> Unit) {
        writableDatabase.beginTransaction()
        try { block(); writableDatabase.setTransactionSuccessful() } finally { writableDatabase.endTransaction() }
    }
    fun json(id: String) = get(id)?.let(::JSONObject)
    fun array(id: String) = get(id)?.let(::JSONArray) ?: JSONArray()
    @Synchronized fun wipe() {
        writableDatabase.delete("private_values", null, null)
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(alias) }
    }
}
