package app.saveit.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.sqlite.SQLiteDatabase
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONArray
import org.json.JSONObject

class SaveItOverlayService : Service() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var windowManager: WindowManager? = null
  private var overlayView: View? = null
  private var selectedChip: String? = null
  private var isImportant = false
  private val autoDismissRunnable = Runnable { stopSelf() }
  private var closeSystemDialogsReceiverRegistered = false
  private val closeSystemDialogsReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == Intent.ACTION_CLOSE_SYSTEM_DIALOGS) {
        stopSelf()
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIFICATION_ID, buildNotification())
    val url = intent?.getStringExtra(EXTRA_URL)?.takeIf { it.startsWith("http", ignoreCase = true) }

    if (url.isNullOrBlank()) {
      stopSelf()
      return START_NOT_STICKY
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      val uri = android.net.Uri.parse("saveit://share?url=" + android.net.Uri.encode(url))
      val launchIntent = Intent(Intent.ACTION_VIEW, uri).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      startActivity(launchIntent)
      stopSelf()
      return START_NOT_STICKY
    }

    showOverlay(url)
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    dismissOverlay()
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun showOverlay(url: String) {
    dismissOverlay()

    val wm = getSystemService(WINDOW_SERVICE) as WindowManager
    windowManager = wm

    val popup = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(14), dp(16), dp(16))
      background = roundedGradient(intArrayOf(Color.WHITE, Color.rgb(250, 249, 255)), dp(22).toFloat())
      elevation = dp(10).toFloat()
      isClickable = true
    }

    val header = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }

    val thumbnail = ImageView(this).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      background = roundedFill(Color.rgb(239, 237, 255), dp(14).toFloat())
      setImageResource(R.mipmap.ic_launcher_foreground)
    }
    header.addView(thumbnail, LinearLayout.LayoutParams(dp(76), dp(76)))

    val textStack = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), 0, dp(8), 0)
    }
    textStack.addView(platformBadge(detectPlatform(url)))
    textStack.addView(TextView(this).apply {
      text = inferTitle(url)
      setTextColor(Color.rgb(21, 20, 31))
      textSize = 15f
      typeface = Typeface.DEFAULT_BOLD
      maxLines = 2
      setPadding(0, dp(6), 0, 0)
    })
    header.addView(textStack, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

    header.addView(ImageButton(this).apply {
      setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
      background = roundedFill(Color.rgb(245, 244, 250), dp(18).toFloat())
      setColorFilter(Color.rgb(21, 20, 31))
      setOnClickListener { stopSelf() }
    }, LinearLayout.LayoutParams(dp(36), dp(36)))
    popup.addView(header)

    val reasonInput = EditText(this).apply {
      hint = "Why saving?"
      textSize = 14f
      setSingleLine(true)
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
      setTextColor(Color.rgb(21, 20, 31))
      setHintTextColor(Color.rgb(110, 106, 125))
      background = roundedStroke(Color.WHITE, Color.rgb(232, 229, 242), dp(14).toFloat())
      setPadding(dp(12), 0, dp(12), 0)
    }
    popup.addView(reasonInput, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      dp(46)
    ).apply { topMargin = dp(12) })

    popup.addView(chipRow())

    val saveButton = Button(this).apply {
      text = "Save \u2713"
      textSize = 16f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(Color.WHITE)
      background = roundedFill(Color.rgb(83, 74, 183), dp(18).toFloat())
      setOnClickListener {
        enqueueSave(url, reasonInput.text?.toString(), selectedChip, isImportant)
        text = "Saved! \u2713"
        isEnabled = false
        animate()
          .scaleX(0.97f)
          .scaleY(0.97f)
          .alpha(0.92f)
          .setDuration(120)
          .withEndAction {
            animate()
              .scaleX(1f)
              .scaleY(1f)
              .alpha(1f)
              .setDuration(140)
              .start()
          }
          .start()
        mainHandler.postDelayed({ stopSelf() }, 430)
      }
    }
    popup.addView(saveButton, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      dp(52)
    ).apply { topMargin = dp(14) })

    val container = FrameLayout(this).apply {
      setPadding(dp(14), dp(14), dp(14), dp(14))
      setBackgroundColor(Color.argb(38, 0, 0, 0))
      isClickable = true
      setOnClickListener { stopSelf() }
      addView(
        popup,
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.WRAP_CONTENT,
          Gravity.TOP or Gravity.CENTER_HORIZONTAL
        )
      )
    }

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
      android.graphics.PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      y = dp(44)
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE
    }

    overlayView = container
    wm.addView(container, params)
    registerCloseSystemDialogsReceiver()
    mainHandler.postDelayed(autoDismissRunnable, AUTO_DISMISS_MS)
    loadThumbnailAsync(url, thumbnail)

    // PRIORITY 2 FIX — KEYBOARD AUTO-FOCUS
    // For overlay windows (TYPE_APPLICATION_OVERLAY), Android does NOT
    // auto-show the keyboard when an EditText gains focus. We must:
    // 1. Wait for the overlay window to fully attach (postDelayed 150ms)
    // 2. Explicitly request focus on the EditText
    // 3. Explicitly show the soft keyboard via InputMethodManager with
    //    SHOW_FORCED (SHOW_IMPLICIT is unreliable for overlay windows)
    reasonInput.postDelayed({
      reasonInput.requestFocus()
      val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
      imm?.showSoftInput(reasonInput, InputMethodManager.SHOW_FORCED)
    }, 150)
  }

  private fun chipRow(): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, dp(12), 0, 0)
    }
    listOf("Try later", "Inspiration", "Learn this", "Important \u2605").forEach { label ->
      val chip = TextView(this).apply {
        text = label
        textSize = 13f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(dp(12), 0, dp(12), 0)
        setTextColor(Color.rgb(110, 106, 125))
        background = roundedStroke(Color.WHITE, Color.rgb(232, 229, 242), dp(18).toFloat())
        setOnClickListener {
          isImportant = label.startsWith("Important")
          selectedChip = if (isImportant) null else label
          for (index in 0 until row.childCount) {
            val child = row.getChildAt(index) as? TextView ?: continue
            child.setTextColor(Color.rgb(110, 106, 125))
            child.background = roundedStroke(Color.WHITE, Color.rgb(232, 229, 242), dp(18).toFloat())
          }
          setTextColor(if (isImportant) Color.rgb(138, 106, 22) else Color.rgb(83, 74, 183))
          background = roundedFill(if (isImportant) Color.rgb(255, 246, 216) else Color.rgb(239, 237, 255), dp(18).toFloat())
        }
      }
      row.addView(chip, LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        dp(36)
      ).apply { rightMargin = dp(8) })
    }

    return HorizontalScrollView(this).apply {
      isHorizontalScrollBarEnabled = false
      addView(row)
    }
  }

  private fun platformBadge(platform: String): TextView {
    val (label, color) = when (platform) {
      "youtube" -> "YouTube" to Color.rgb(255, 0, 51)
      "instagram" -> "Instagram" to Color.rgb(193, 53, 132)
      "tiktok" -> "TikTok" to Color.rgb(17, 17, 17)
      else -> "Web" to Color.rgb(79, 93, 117)
    }
    return TextView(this).apply {
      text = label
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(color)
      background = roundedFill(Color.rgb(245, 244, 250), dp(14).toFloat())
      setPadding(dp(10), dp(4), dp(10), dp(4))
    }
  }

  private fun enqueueSave(url: String, reason: String?, chip: String?, important: Boolean) {
    try {
      val dbFile = getDatabasePath("RKStorage")
      dbFile.parentFile?.mkdirs()
      val db = SQLiteDatabase.openOrCreateDatabase(dbFile, null)
      db.execSQL("CREATE TABLE IF NOT EXISTS catalystLocalStorage (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
      val cursor = db.rawQuery("SELECT value FROM catalystLocalStorage WHERE key = ?", arrayOf(QUEUE_KEY))
      val existing = if (cursor.moveToFirst()) cursor.getString(0) else null
      cursor.close()

      val queue = existing?.let { JSONArray(it) } ?: JSONArray()
      queue.put(JSONObject().apply {
        put("url", url)
        put("created_at", isoNow())
        put("saveReason", reason?.trim().orEmpty())
        if (!chip.isNullOrBlank()) put("saveReasonChip", chip)
        put("isImportant", important)
      })

      val statement = db.compileStatement(
        "INSERT OR REPLACE INTO catalystLocalStorage (key, value) VALUES (?, ?)"
      )
      statement.bindString(1, QUEUE_KEY)
      statement.bindString(2, queue.toString())
      statement.execute()
      statement.close()
      db.close()
    } catch (_: Exception) {
      // The overlay must never crash the host app.
    }
  }

  private fun loadThumbnailAsync(url: String, imageView: ImageView) {
    Thread {
      val imageUrl = fetchThumbnailUrl(url)
      if (imageUrl.isNullOrBlank()) return@Thread
      try {
        val connection = URL(imageUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = 4000
        connection.readTimeout = 4000
        connection.inputStream.use { stream ->
          val bitmap = BitmapFactory.decodeStream(stream)
          if (bitmap != null) {
            mainHandler.post {
              if (overlayView != null) imageView.setImageBitmap(bitmap)
            }
          }
        }
      } catch (_: Exception) {
        // Keep placeholder thumbnail.
      }
    }.start()
  }

  private fun fetchThumbnailUrl(url: String): String? {
    youtubeVideoId(url)?.let { return "https://img.youtube.com/vi/$it/hqdefault.jpg" }
    return try {
      val connection = URL(url).openConnection() as HttpURLConnection
      connection.connectTimeout = 3000
      connection.readTimeout = 3000
      connection.setRequestProperty("User-Agent", "SaveIt/1.0 overlay")
      val html = connection.inputStream.bufferedReader().use { it.readText().take(240_000) }
      val regex = Regex(
        """<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']""",
        RegexOption.IGNORE_CASE
      )
      regex.find(html)?.groupValues?.getOrNull(1)
    } catch (_: Exception) {
      null
    }
  }

  private fun inferTitle(url: String): String {
    val lower = url.lowercase(Locale.US)
    return when {
      lower.contains("youtube.com/shorts") -> "YouTube Short"
      lower.contains("youtube.com") || lower.contains("youtu.be") -> "YouTube video"
      lower.contains("instagram.com/reel") -> "Instagram Reel"
      lower.contains("instagram.com/p/") -> "Instagram post"
      lower.contains("tiktok.com") -> "TikTok video"
      else -> runCatching { URL(url).host.replace("www.", "") }.getOrDefault("Saved link")
    }
  }

  private fun detectPlatform(url: String): String {
    val lower = url.lowercase(Locale.US)
    return when {
      lower.contains("youtube.com") || lower.contains("youtu.be") -> "youtube"
      lower.contains("instagram.com") -> "instagram"
      lower.contains("tiktok.com") -> "tiktok"
      else -> "other"
    }
  }

  private fun youtubeVideoId(url: String): String? {
    return try {
      val parsed = android.net.Uri.parse(url)
      val host = parsed.host.orEmpty()
      when {
        host.contains("youtu.be") -> parsed.pathSegments.firstOrNull()
        host.contains("youtube.com") && parsed.getQueryParameter("v") != null -> parsed.getQueryParameter("v")
        host.contains("youtube.com") && parsed.pathSegments.firstOrNull() == "shorts" -> parsed.pathSegments.getOrNull(1)
        else -> null
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun dismissOverlay() {
    mainHandler.removeCallbacks(autoDismissRunnable)
    unregisterCloseSystemDialogsReceiver()
    val view = overlayView ?: return
    runCatching { windowManager?.removeView(view) }
    overlayView = null
  }

  private fun registerCloseSystemDialogsReceiver() {
    if (closeSystemDialogsReceiverRegistered) return
    val filter = IntentFilter(Intent.ACTION_CLOSE_SYSTEM_DIALOGS)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(closeSystemDialogsReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      @Suppress("DEPRECATION")
      registerReceiver(closeSystemDialogsReceiver, filter)
    }
    closeSystemDialogsReceiverRegistered = true
  }

  private fun unregisterCloseSystemDialogsReceiver() {
    if (!closeSystemDialogsReceiverRegistered) return
    runCatching { unregisterReceiver(closeSystemDialogsReceiver) }
    closeSystemDialogsReceiverRegistered = false
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "SaveIt overlay", NotificationManager.IMPORTANCE_LOW)
      )
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("SaveIt quick save")
      .setContentText("Floating save popup is active")
      .setOngoing(false)
      .build()
  }

  private fun roundedFill(color: Int, radius: Float): GradientDrawable {
    return GradientDrawable().apply {
      setColor(color)
      cornerRadius = radius
    }
  }

  private fun roundedStroke(fill: Int, stroke: Int, radius: Float): GradientDrawable {
    return GradientDrawable().apply {
      setColor(fill)
      cornerRadius = radius
      setStroke(dp(1), stroke)
    }
  }

  private fun roundedGradient(colors: IntArray, radius: Float): GradientDrawable {
    return GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, colors).apply {
      cornerRadius = radius
    }
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun isoNow(): String {
    return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date())
  }

  companion object {
    const val EXTRA_URL = "app.saveit.mobile.EXTRA_URL"
    private const val CHANNEL_ID = "saveit-overlay"
    private const val NOTIFICATION_ID = 7701
    private const val QUEUE_KEY = "saveit:shared_queue:v1"
    private const val AUTO_DISMISS_MS = 28_000L
  }
}
