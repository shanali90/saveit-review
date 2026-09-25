package app.saveit.mobile

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle

class SaveItShareActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleShareIntent(intent)
    finish()
    overridePendingTransition(0, 0)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    handleShareIntent(intent)
    finish()
    overridePendingTransition(0, 0)
  }

  private fun handleShareIntent(incomingIntent: Intent?) {
    if (incomingIntent?.action != Intent.ACTION_SEND) return

    val sharedText = incomingIntent.getStringExtra(Intent.EXTRA_TEXT)
      ?: incomingIntent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
      ?: return
    val url = Regex("""https?://[^\s<>"']+""").find(sharedText)?.value ?: sharedText
    if (!url.startsWith("http", ignoreCase = true)) return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !android.provider.Settings.canDrawOverlays(this)) {
      val uri = android.net.Uri.parse("saveit://share?url=" + android.net.Uri.encode(url))
      val launchIntent = Intent(Intent.ACTION_VIEW, uri).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      startActivity(launchIntent)
    } else {
      val serviceIntent = Intent(this, SaveItOverlayService::class.java).apply {
        putExtra(SaveItOverlayService.EXTRA_URL, url)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        startForegroundService(serviceIntent)
      } else {
        startService(serviceIntent)
      }
    }
  }
}
