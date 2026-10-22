package app.onepair.p2p;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

/** Explicit-consent screen capture. Frames stay in memory and are never written to disk. */
public class ScreenCaptureService extends Service {
    static final String STOP = "app.onepair.p2p.STOP_SCREEN_CAPTURE";
    private static final String CHANNEL = "screen-sharing";
    private static final int NOTIFICATION = 4250;
    private static final int MAX_FRAME_BYTES = 256 * 1024;
    static volatile boolean running;
    static volatile boolean active;
    private Listener sessionListener;
    interface Listener {
        void started(int width, int height);
        void frame(String data, int width, int height);
        void stopped(String reason);
    }
    static volatile Listener listener;
    private HandlerThread thread;
    private Handler worker;
    private MediaProjection projection;
    private MediaProjection.Callback callback;
    private VirtualDisplay display;
    private ImageReader reader;
    private Bitmap bitmap;
    private ByteBuffer pixels;
    private byte[] row;
    private int width, height;
    private long lastFrame;
    private volatile boolean stopping;

    @Override public void onCreate() {
        super.onCreate(); active = true;
        thread = new HandlerThread("OnePair-screen"); thread.start();
        worker = new Handler(thread.getLooper());
    }
    private Notification notification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Screen sharing", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Visible while your screen is shared with connected friends");
            channel.setSound(null, null); channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        Intent stop = new Intent(this, ScreenCaptureService.class).setAction(STOP);
        PendingIntent stopAction = PendingIntent.getService(this, 4251, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_heart).setContentTitle("OnePair is sharing your screen")
            .setContentText("Your selected screen is visible to connected friends. Tap Stop to end.")
            .setContentIntent(PendingIntent.getActivity(this, 4252, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .setVisibility(Notification.VISIBILITY_PRIVATE).setOngoing(true).setSilent(true)
            .addAction(0, "Stop sharing", stopAction).build();
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || STOP.equals(intent.getAction())) {finish("Screen sharing stopped."); return START_NOT_STICKY;}
        if (projection != null || stopping) return START_NOT_STICKY;
        sessionListener = listener;
        try {
            // Android 14 requires consent first, foreground mediaProjection second, projection third.
            ServiceCompat.startForeground(this, NOTIFICATION, notification(), Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION : 0);
            Intent consent = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra("consent", Intent.class) : intent.getParcelableExtra("consent");
            if (consent == null) throw new IllegalStateException("Screen capture permission was not granted.");
            projection = getSystemService(MediaProjectionManager.class).getMediaProjection(Activity.RESULT_OK, consent);
            callback = new MediaProjection.Callback() {
                @Override public void onStop() {finish("Screen sharing ended by Android or the user.");}
                @Override public void onCapturedContentResize(int w, int h) {try {if (!stopping && display != null) resize(w, h);} catch (Exception e) {finish("Screen resize failed.");}}
            };
            projection.registerCallback(callback, worker);
            worker.post(() -> {
                try {
                    int[] size = screenSize(); resize(size[0], size[1]);
                    if (stopping) return;
                    display = projection.createVirtualDisplay("OnePair screen", width, height, getResources().getConfiguration().densityDpi,
                        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.getSurface(), null, worker);
                    running = true;
                    Listener sink = sessionListener; if (sink != null) sink.started(width, height); else finish("Screen capture listener disconnected.");
                } catch (Exception e) {finish("Could not start screen sharing: " + e.getMessage());}
            });
        } catch (Exception e) {finish("Could not start screen sharing: " + e.getMessage());}
        return START_NOT_STICKY;
    }
    private int[] screenSize() {
        WindowManager manager = getSystemService(WindowManager.class);
        if (Build.VERSION.SDK_INT >= 30) {
            Rect bounds = manager.getMaximumWindowMetrics().getBounds(); return new int[]{bounds.width(), bounds.height()};
        }
        DisplayMetrics metrics = new DisplayMetrics(); manager.getDefaultDisplay().getRealMetrics(metrics);
        return new int[]{metrics.widthPixels, metrics.heightPixels};
    }
    private void resize(int sourceWidth, int sourceHeight) {
        if (stopping || sourceWidth <= 0 || sourceHeight <= 0) return;
        double scale = Math.min(1d, Math.min(1280d / Math.max(sourceWidth, sourceHeight), 720d / Math.min(sourceWidth, sourceHeight)));
        int w = Math.max(2, (int)(sourceWidth * scale)), h = Math.max(2, (int)(sourceHeight * scale));
        if (reader != null && w == width && h == height) return;
        ImageReader next = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2);
        Bitmap nextBitmap = null;
        try {
            nextBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            ByteBuffer nextPixels = ByteBuffer.allocateDirect(w * h * 4);
            byte[] nextRow = new byte[w * 4];
            next.setOnImageAvailableListener(this::consume, worker);
            if (display != null) {
                display.setSurface(null);
                display.resize(w, h, getResources().getConfiguration().densityDpi);
                display.setSurface(next.getSurface());
            }
            ImageReader previous = reader; Bitmap oldBitmap = bitmap;
            width = w; height = h; reader = next; bitmap = nextBitmap; pixels = nextPixels; row = nextRow;
            if (previous != null) previous.close();
            if (oldBitmap != null) oldBitmap.recycle();
        } catch (RuntimeException error) {
            next.close(); if (nextBitmap != null) nextBitmap.recycle(); throw error;
        }
    }
    private void consume(ImageReader source) {
        if (stopping || source != reader) return;
        Image image = null;
        try {
            image = source.acquireLatestImage();
            long now = SystemClock.elapsedRealtime();
            if (image == null || now - lastFrame < 100) return;
            lastFrame = now;
            Image.Plane plane = image.getPlanes()[0];
            if (plane.getPixelStride() != 4) throw new IllegalStateException("Unsupported screen pixel format.");
            ByteBuffer buffer = plane.getBuffer(); pixels.clear();
            // Copy only visible pixels; ImageReader row padding must never become visible stripes.
            for (int y = 0; y < height; y++) {buffer.position(y * plane.getRowStride()); buffer.get(row); pixels.put(row);}
            pixels.flip(); bitmap.copyPixelsFromBuffer(pixels);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(64 * 1024);
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 60, bytes)) throw new IllegalStateException("Could not encode the captured screen.");
            if (bytes.size() > MAX_FRAME_BYTES) {bytes.reset(); bitmap.compress(Bitmap.CompressFormat.JPEG, 35, bytes);}
            if (bytes.size() > MAX_FRAME_BYTES) {bytes.reset(); bitmap.compress(Bitmap.CompressFormat.JPEG, 20, bytes);}
            if (bytes.size() == 0 || bytes.size() > MAX_FRAME_BYTES) return;
            Listener sink = sessionListener;
            if (sink != null && !stopping) sink.frame(Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP), width, height);
        } catch (Exception e) {finish("Screen capture failed: " + e.getMessage());}
        finally {if (image != null) image.close();}
    }
    @Override public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        if (Build.VERSION.SDK_INT < 34 && worker != null) worker.post(() -> {try {int[] size=screenSize(); resize(size[0], size[1]);} catch (Exception e) {finish("Screen resize failed.");}});
    }
    private synchronized void finish(String reason) {
        if (stopping) return;
        stopping = true; running = false;
        worker.post(() -> {
            try {if (display != null) display.release();} catch (Exception ignored) {} finally {display = null;}
            try {if (reader != null) reader.close();} catch (Exception ignored) {} finally {reader = null;}
            if (bitmap != null) {bitmap.recycle(); bitmap = null;}
            pixels = null; row = null;
            if (projection != null) {
                try {if (callback != null) projection.unregisterCallback(callback); projection.stop();} catch (Exception ignored) {}
                projection = null;
            }
            stopForeground(STOP_FOREGROUND_REMOVE); stopSelf();
            active = false;
            Listener sink = sessionListener;
            if (listener == sink) listener = null;
            if (sink != null) sink.stopped(reason);
            thread.quitSafely();
        });
    }
    @Override public void onDestroy() {finish("Screen sharing stopped."); super.onDestroy();}
    @Override public IBinder onBind(Intent intent) {return null;}
}
