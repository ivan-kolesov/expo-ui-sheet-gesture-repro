# expo-ui ModalBottomSheet: RN content lags the keyboard on the predictive back gesture (Android)

Minimal reproduction for an `expo-modules-core` / `@expo/ui` bug. The project is a blank SDK 57 app
(`create-expo-app --template blank-typescript@sdk-57`) plus `@expo/ui`. All of the code is in [`App.tsx`](App.tsx).
`predictiveBackGestureEnabled` is `true` in `app.json`.

The app opens a `ModalBottomSheet` that hosts React Native content in an `RNHostView` without `matchContents`, so
Compose sizes the host and reports the size to Yoga. The red block is `flex: 1` and should always reach the
keyboard, or the bottom of the sheet once the keyboard is gone.

## Steps

1. `npm install`
2. `npx expo run:android --variant release` (a debug build shows the same thing). Use a device or emulator with
   gesture navigation (tested on an API 37 emulator).
3. Tap **Open sheet**, then tap the text field to show the keyboard.
4. Dismiss the keyboard with the **back gesture**, a swipe from the left screen edge. (`adb shell input swipe 3 1500 500 1500 220`
   does it too.)

**Expected:** the red block follows the keyboard down, frame by frame, like it does when the keyboard is dismissed
with the back *button* (`adb shell input keyevent KEYCODE_BACK`).

**Actual:** the keyboard slides away, but the red block keeps its short height for ~200 ms. An empty strip of
sheet surface opens between the block and the keyboard, and then the block jumps to full height in one frame.
`console.log` from the content's `onLayout`:

```
.008 … .172  RN content height 478 → 501   (while the finger moves)
                                            ← nothing for ~200 ms while the keyboard animates away
.371         RN content height 789.7       (one jump, after the animation)
```

- [`media/before.mp4`](media/before.mp4): this repo as is.
- [`media/after-with-fix.mp4`](media/after-with-fix.mp4): with the change below.
- [`media/frames-before-top-after-bottom.png`](media/frames-before-top-after-bottom.png): consecutive frames,
  before on top and after at the bottom.

## Cause

`ShadowNodeProxy.setViewSize` doesn't push the size to the shadow node right away. It schedules a flush on an
`OnPreDrawListener` of the `RNHostView`'s own `ViewTreeObserver`, with a `view.post` fallback (added for #47778).

- The `RNHostView` is attached to the **activity** window, but the sheet content is drawn in the **sheet's
  dialog window**.
- Dismissing the keyboard with the back button redraws the activity window too. The predraw listener then fires on
  every frame, and the flush lands 4–5 ms after `onSizeChanged`.
- With the predictive back gesture, only the sheet window animates with the IME. The predraw listener of the
  activity window never fires.
- The `view.post` fallback is a synchronous message, so it waits behind the traversal sync barrier that the sheet
  window posts on every frame. On top of that, `scheduleFlush` removes and re-posts it on every size change, so
  every frame it lands behind the next frame again.
- Logged on the device: 12 `setViewSize` calls in 165 ms, and the first flush 200 ms after the first call, when the
  animation was already over.

## Fix that works for us

`packages/expo-modules-core/android/src/main/java/expo/modules/kotlin/views/ShadowNodeProxy.kt`: post the fallback
as an asynchronous message, which sync barriers don't hold, and post it once per pending flush instead of moving it
on every size change. With this, the content follows the Compose size within one frame (5–30 ms).

```diff
+import android.os.Handler
+import android.os.Looper
+import android.os.Message
 import android.view.ViewTreeObserver
@@
   private var preDrawListener: ViewTreeObserver.OnPreDrawListener? = null
-  private val flushRunnable = Runnable { drainPendingFlush() }
+  private val mainHandler = Handler(Looper.getMainLooper())
+  private var flushPosted = false
+  private val flushRunnable = Runnable {
+    flushPosted = false
+    drainPendingFlush()
+  }
@@ private fun scheduleFlush(flush: (stateWrapper: Any) -> Unit) {
-    view.removeCallbacks(flushRunnable)
-    view.post(flushRunnable)
+    if (!flushPosted) {
+      flushPosted = true
+      mainHandler.sendMessage(Message.obtain(mainHandler, flushRunnable).apply { isAsynchronous = true })
+    }
```
