package app.onepair.p2p;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.widget.RemoteViews;
import com.bluebubbles.messaging.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "OpenPigeon")
public class OpenPigeonPlugin extends Plugin {
    static OpenPigeonPlugin instance;
    static final String SERVICE = "com.openbubbles.openpigeon.MadridExtensionService";
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService remote = Executors.newSingleThreadExecutor();
    private final Map<String, Pending> pending = new LinkedHashMap<>();
    private final Map<String, Room> sessions = new LinkedHashMap<>();
    private IMadridExtension extension;
    private ServiceConnection connection;
    private Room room;
    private OpenPigeonActivity surface;
    private RemoteViews latestViews;
    private PluginCall opening;
    private Runnable boundAction;
    private String token;
    private boolean locked;
    private String activeSession;
    private int reconnects;

    static final class Room {
        final String id;
        final JSArray participants;
        Room(String id, JSArray participants) { this.id = id; this.participants = participants; }
    }
    static final class Pending {
        final JSObject event;
        final Room owner;
        final ITaskCompleteCallback callback;
        Pending(JSObject event, ITaskCompleteCallback callback, Room owner) { this.event = event; this.callback = callback; this.owner = owner; }
    }
    @Override public void load() { instance = this; }

    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject();
        try {
            getContext().getPackageManager().getServiceInfo(new ComponentName(getContext().getPackageName(), SERVICE), 0);
            result.put("version", com.openbubbles.openpigeon.BuildConfig.VERSION_NAME);
            result.put("installed", true);
            result.put("bundled", true);
        } catch (Exception absent) {
            result.put("installed", false);
            result.put("version", "");
        }
        call.resolve(result);
    }
    private Room readRoom(PluginCall call) throws Exception {
        String id = call.getString("roomId", "");
        JSArray people = call.getArray("participants");
        if (id.isEmpty() || id.length() > 128 || people == null || people.length() < 2 || people.length() > 4) throw new Exception("Choose a room with 2–4 players");
        Set<String> unique = new HashSet<>();
        for (int i = 0; i < people.length(); i++) {
            String person = people.getString(i);
            if (person.isEmpty() || person.length() > 128 || !unique.add(person)) throw new Exception("Invalid players");
        }
        return new Room(id, new JSArray(people.toString()));
    }
    private void state(String error) {
        JSObject value = new JSObject(); value.put("connected", extension != null); value.put("locked", locked);
        if (error != null) value.put("error", error);
        notifyListeners("state", value, true);
    }
    private void fail(String text) {
        if (opening != null) { opening.reject(text); opening = null; }
        state(text);
    }
    private boolean sameRoom(Room a, Room b) { return a != null && b != null && a.id.equals(b.id) && a.participants.toString().equals(b.participants.toString()); }
    private boolean select(Room next, PluginCall call) {
        if (locked && !sameRoom(room, next)) { call.reject("Finish the active OpenPigeon game before switching rooms"); return false; }
        if (opening != null) { call.reject("OpenPigeon is already opening"); return false; }
        room = next; return true;
    }
    @PluginMethod public void openPicker(PluginCall call) {
        try {
            Room next = readRoom(call);
            main.post(() -> {
                if (locked) { call.reject("Finish the active game before choosing another"); return; }
                if (!select(next, call)) return;
                reconnects = 0; opening = call; token = UUID.randomUUID().toString(); latestViews = null;
                connect(() -> showKeyboard(next));
                main.postDelayed(() -> { if (opening == call) fail("OpenPigeon did not open within 10 seconds"); }, 10000);
            });
        } catch (Exception e) { call.reject(e.getMessage()); }
    }
    private void connect(Runnable action) {
        boundAction = action;
        if (extension != null) { action.run(); return; }
        if (connection != null) return;
        connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                extension = IMadridExtension.Stub.asInterface(binder); state(null);
                try { binder.linkToDeath(() -> main.post(() -> disconnected()), 0); } catch (Exception e) { disconnected(); return; }
                if (boundAction != null) boundAction.run();
            }
            @Override public void onServiceDisconnected(ComponentName name) { disconnected(); }
            @Override public void onBindingDied(ComponentName name) { disconnected(); }
            @Override public void onNullBinding(ComponentName name) { fail("OpenPigeon returned no game service"); releaseBinding(); }
        };
        try {
            Intent intent = new Intent().setComponent(new ComponentName(getContext().getPackageName(), SERVICE));
            int flags = Context.BIND_AUTO_CREATE;
            if (!getContext().bindService(intent, connection, flags)) { releaseBinding(); fail("The included OpenPigeon engine could not start; restart OnePair"); }
        } catch (Exception e) { releaseBinding(); fail("Cannot connect to OpenPigeon"); }
    }
    private void disconnected() {
        if (extension == null && connection == null) return;
        releaseBinding(); locked = false; state("OpenPigeon disconnected; reopen the game if it closed");
        if (room != null && reconnects++ < 2) main.postDelayed(() -> connect(() -> showKeyboard(room)), 1000);
    }
    private void releaseBinding() {
        extension = null;
        if (connection != null) { try { getContext().unbindService(connection); } catch (Exception ignored) {} connection = null; }
    }
    private IViewUpdateCallback viewCallback(final Room context, final String expectedToken) {
        return new IViewUpdateCallback.Stub() {
            @Override public void updateView(RemoteViews views) { main.post(() -> { if (sameRoom(room, context) && Objects.equals(token, expectedToken)) display(views); }); }
        };
    }
    private void showKeyboard(Room context) {
        final IMadridExtension service = extension; final String expectedToken = token;
        remote.execute(() -> {
            try {
                RemoteViews views = service.keyboardOpened(viewCallback(context, expectedToken), new IKeyboardHandle.Stub() {
                    @Override public void addMessage(MadridMessage message) { main.post(() -> emit(context, message, null, null)); }
                }, context.participants.length());
                main.post(() -> { if (sameRoom(room, context) && Objects.equals(token, expectedToken)) display(views); });
            } catch (Exception e) { main.post(() -> fail("OpenPigeon could not create its game picker")); }
        });
    }
    private void display(RemoteViews views) {
        if (views == null || !getContext().getPackageName().equals(views.getPackage())) { fail("Invalid OpenPigeon view"); return; }
        latestViews = views;
        if (surface == null) {
            getActivity().startActivity(new Intent(getContext(), OpenPigeonActivity.class).putExtra("token", token));
        } else render();
    }
    private void render() {
        try {
            surface.render(latestViews);
            if (opening != null) { opening.resolve(); opening = null; }
        } catch (Exception e) { fail("Cannot display the included OpenPigeon picker; restart OnePair"); }
    }
    boolean attach(OpenPigeonActivity activity, String value) {
        if (!Objects.equals(token, value) || latestViews == null) return false;
        surface = activity; render(); return true;
    }
    void detach(OpenPigeonActivity activity, String value, boolean changing) {
        if (surface != activity) return;
        surface = null;
        // OpenPigeon's game activity can outlive the chooser; keep its message handles alive.
        if (!changing && !locked && extension != null) {
            IMadridExtension service = extension;
            remote.execute(() -> { try { service.keyboardClosed(); } catch (Exception ignored) {} });
        }
    }
    private MadridMessage readMessage(JSObject value) throws Exception {
        if (value == null) throw new Exception("Missing game message");
        MadridMessage m = new MadridMessage();
        m.messageGuid = value.getString("messageGuid", ""); m.url = value.getString("url", ""); m.session = value.getString("session", "");
        if (!OpenPigeonPayload.valid(m.messageGuid, m.session, m.url)) throw new Exception("Invalid game payload");
        m.ldText = label(value, "ldText"); m.caption = label(value, "caption"); m.subcaption = label(value, "subcaption");
        m.secondaryCaption = label(value, "secondaryCaption"); m.tertiaryCaption = label(value, "tertiaryCaption");
        m.imageTitle = label(value, "imageTitle"); m.imageSubtitle = label(value, "imageSubtitle"); m.isLive = value.getBoolean("isLive", true);
        return m;
    }
    private String label(JSObject value, String key) throws Exception {
        String text = value.getString(key); if (text != null && text.length() > 200) throw new Exception("Game label too long"); return text;
    }
    private void optional(JSObject value, String key, String text) { if (text != null) value.put(key, text); }
    private JSObject wire(MadridMessage m) throws Exception {
        JSObject value = new JSObject(); value.put("messageGuid", m.messageGuid); value.put("url", m.url); value.put("session", m.session);
        optional(value, "ldText", m.ldText); optional(value, "caption", m.caption); optional(value, "subcaption", m.subcaption);
        optional(value, "secondaryCaption", m.secondaryCaption); optional(value, "tertiaryCaption", m.tertiaryCaption);
        optional(value, "imageTitle", m.imageTitle); optional(value, "imageSubtitle", m.imageSubtitle); value.put("isLive", m.isLive);
        readMessage(value); return value;
    }
    private IMessageViewHandle handle(final Room context, final String session) {
        return new IMessageViewHandle.Stub() {
            @Override public void updateMessage(MadridMessage message, ITaskCompleteCallback callback) { main.post(() -> emit(context, message, callback, session)); }
            @Override public void setSuppressNotifications(boolean value) { /* Padi independently controls notification policy. */ }
            @Override public void lock() { main.post(() -> { if (sameRoom(room, context) && Objects.equals(activeSession, session)) { locked = true; state(null); } }); }
            @Override public void unlock() { main.post(() -> { if (sameRoom(room, context) && Objects.equals(activeSession, session)) { locked = false; state(null); } }); }
        };
    }
    private void emit(Room context, MadridMessage message, ITaskCompleteCallback callback, String expectedSession) {
        try {
            if (expectedSession != null && !expectedSession.equals(message.session)) throw new Exception("OpenPigeon changed the game session");
            if (pending.size() >= 8) throw new Exception("Too many unsent game updates; reconnect your room");
            JSObject payload = wire(message);
            Room owner = sessions.get(message.session);
            if (owner != null && !sameRoom(owner, context)) throw new Exception("Game session belongs to another room");
            sessions.put(message.session, context);
            if (sessions.size() > 64) sessions.remove(sessions.keySet().iterator().next());
            String id = UUID.randomUUID().toString(); JSObject event = new JSObject();
            event.put("requestId", id); event.put("roomId", context.id); event.put("participants", context.participants); event.put("message", payload);
            Pending update = new Pending(event, callback, context); pending.put(id, update); notifyListeners("message", event, true);
            main.postDelayed(() -> { if (pending.get(id) == update) state("Game update not confirmed; reconnect and retry"); }, 20000);
        } catch (Exception e) { state(e.getMessage()); }
    }
    @PluginMethod public void acknowledge(PluginCall call) {
        main.post(() -> {
            String id = call.getString("requestId", ""); Pending update = pending.get(id);
            if (update == null) { call.reject("Unknown game update"); return; }
            if (!call.getBoolean("success", false)) { state("Game update was not delivered; reopen the room to retry"); call.resolve(); return; }
            pending.remove(id);
            if (update.callback != null) remote.execute(() -> { try { update.callback.complete(); } catch (Exception e) { main.post(() -> state("OpenPigeon closed before delivery confirmation")); } });
            call.resolve();
        });
    }
    @PluginMethod public void openGame(PluginCall call) { messageAction(call, true); }
    @PluginMethod public void syncMessage(PluginCall call) { messageAction(call, false); }
    private void messageAction(PluginCall call, boolean open) {
        try {
            final Room context = readRoom(call); final MadridMessage message = readMessage(call.getObject("message"));
            main.post(() -> {
                Room owner = sessions.get(message.session);
                if (owner != null && !sameRoom(owner, context)) { call.reject("Game session belongs to another room"); return; }
                if (open && locked && !Objects.equals(activeSession, message.session)) { call.reject("Finish the active game first"); return; }
                if (open && !select(context, call)) return;
                if (open) activeSession = message.session;
                sessions.put(message.session, context);
                if (sessions.size() > 64) sessions.remove(sessions.keySet().iterator().next());
                final String session = message.session;
                Runnable action = () -> {
                    final IMadridExtension service = extension;
                    remote.execute(() -> {
                        try {
                            service.getLiveView(new IViewUpdateCallback.Stub() { @Override public void updateView(RemoteViews ignored) {} }, message, handle(context, session), context.participants.length());
                            service.messageUpdated(message);
                            if (open) service.didTapTemplate(message, handle(context, session), context.participants.length());
                            main.post(call::resolve);
                        } catch (Exception e) { main.post(() -> call.reject("OpenPigeon could not open or update this game")); }
                    });
                };
                if (extension != null) action.run();
                else {
                    if (opening != null) { call.reject("OpenPigeon is connecting"); return; }
                    opening = call; connect(() -> { opening = null; action.run(); });
                    main.postDelayed(() -> { if (opening == call) fail("OpenPigeon connection timed out"); }, 10000);
                }
                for (Pending update : pending.values()) if (sameRoom(context, update.owner)) notifyListeners("message", update.event, true);
            });
        } catch (Exception e) { call.reject(e.getMessage()); }
    }
    @PluginMethod public void close(PluginCall call) {
        main.post(() -> {
            if (locked) { call.reject("Finish the active OpenPigeon game before closing"); return; }
            if (surface != null) surface.finish();
            IMadridExtension service = extension;
            if (service != null) remote.execute(() -> { try { service.keyboardClosed(); } catch (Exception ignored) {} });
            boundAction = null; room = null; token = null; latestViews = null; releaseBinding(); call.resolve(); state(null);
        });
    }
    @Override protected void handleOnDestroy() {
        instance = null; releaseBinding(); remote.shutdownNow(); main.removeCallbacksAndMessages(null); super.handleOnDestroy();
    }
}
