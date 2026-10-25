package app.reviewbox.watch

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.pow

class WatchContractTest {
    private fun luminance(color: Int): Double {
        fun channel(shift: Int): Double {
            val c = ((color shr shift) and 255) / 255.0
            return if (c <= .04045) c / 12.92 else ((c + .055) / 1.055).pow(2.4)
        }
        return .2126 * channel(16) + .7152 * channel(8) + .0722 * channel(0)
    }
    private fun contrast(a: Int, b: Int): Double {
        val x = luminance(a); val y = luminance(b)
        return (maxOf(x, y) + .05) / (minOf(x, y) + .05)
    }
    @Test fun nativeTextMeetsSmallScreenContrast() {
        assertTrue(contrast(WatchPalette.Text, WatchPalette.Background) >= 7)
        assertTrue(contrast(WatchPalette.Secondary, WatchPalette.Background) >= 4.5)
        assertTrue(contrast(WatchPalette.Text, WatchPalette.Surface) >= 4.5)
        assertTrue(contrast(WatchPalette.Text, WatchPalette.Action) >= 4.5)
        assertTrue(contrast(WatchPalette.Brand, WatchPalette.Background) >= 4.5)
    }
    @Test fun deviceHashMatchesGatewaySha256AndSecretsHave256Bits() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", WatchApi.sha("abc"))
        val keys = (1..64).map { WatchApi.secret() }
        assertTrue(keys.all { Regex("[a-f0-9]{64}").matches(it) })
        assertEquals(keys.size, keys.toSet().size)
    }
}
