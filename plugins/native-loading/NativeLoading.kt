package com.owllowance.app

import android.animation.ValueAnimator
import android.app.Activity
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.drawable.Animatable2
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/** Owns only launch artwork; storage and navigation remain in React. */
object NativeLoading {
  private val handler = Handler(Looper.getMainLooper())
  private var owner: Activity? = null
  private var overlay: FrameLayout? = null
  private var animation: AnimatedImageDrawable? = null
  private var ready = false
  private var loops = 0
  private var paused = false
  private var reducedMotion = false
  private val timeout = Runnable { remove() }
  val active: Boolean get() = overlay != null

  fun show(activity: Activity) {
    if (Build.VERSION.SDK_INT < 28) return
    remove()
    val drawable = runCatching {
      ImageDecoder.decodeDrawable(ImageDecoder.createSource(activity.assets, "owllowance-loading-loop.gif"))
    }.getOrNull() as? AnimatedImageDrawable ?: return
    owner = activity
    animation = drawable
    ready = false
    loops = 0
    paused = false
    reducedMotion = !ValueAnimator.areAnimatorsEnabled()
    val density = activity.resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()
    val surface = FrameLayout(activity).apply {
      setBackgroundColor(Color.rgb(244, 245, 248))
      isClickable = true
      contentDescription = "Opening Owllowance"
      importantForAccessibility = android.view.View.IMPORTANT_FOR_ACCESSIBILITY_YES
    }
    val column = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
    }
    val size = minOf(dp(300), activity.resources.displayMetrics.widthPixels - dp(40))
    column.addView(ImageView(activity).apply {
      setImageDrawable(drawable)
      scaleType = ImageView.ScaleType.FIT_CENTER
    }, LinearLayout.LayoutParams(size, size))
    if (!reducedMotion) column.addView(ProgressBar(activity).apply {
      indeterminateTintList = ColorStateList.valueOf(Color.rgb(36, 71, 107))
    }, LinearLayout.LayoutParams(dp(20), dp(20)).apply { topMargin = dp(12) })
    surface.addView(column, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))
    (activity.window.decorView as ViewGroup).addView(surface, ViewGroup.LayoutParams(-1, -1))
    overlay = surface
    drawable.repeatCount = 0
    drawable.registerAnimationCallback(object : Animatable2.AnimationCallback() {
      override fun onAnimationEnd(ignored: Drawable?) {
        handler.post {
          if (animation !== drawable) return@post
          loops++
          if (ready && loops >= 2) remove()
          else if (!paused) drawable.start()
        }
      }
    })
    surface.post { if (animation === drawable && !reducedMotion && !paused) drawable.start() }
    // Never cover a development connection error or a failed runtime indefinitely.
    handler.postDelayed(timeout, 15000)
  }

  fun contentReady() {
    handler.post {
      ready = true
      if (reducedMotion) remove()
      // Otherwise the animation-end callback completes the current full loop.
    }
  }

  fun pause() { paused = true; animation?.stop() }
  fun resume() {
    paused = false
    if (!reducedMotion) animation?.start()
  }
  fun dispose(activity: Activity) { if (owner === activity) remove() }
  private fun remove() {
    handler.removeCallbacks(timeout)
    animation?.clearAnimationCallbacks()
    animation?.stop()
    animation = null
    overlay?.let { (it.parent as? ViewGroup)?.removeView(it) }
    overlay = null
    owner = null
  }
}

class NativeLoadingModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "OwllowanceNativeLoading"
  override fun getConstants(): MutableMap<String, Any> = mutableMapOf("active" to NativeLoading.active)
  @ReactMethod fun contentReady() { NativeLoading.contentReady() }
}

class NativeLoadingPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(NativeLoadingModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
