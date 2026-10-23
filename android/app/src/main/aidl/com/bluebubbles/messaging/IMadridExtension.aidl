// Independently declared Madrid interoperability contract; see android/MADRID-NOTICE.md.
package com.bluebubbles.messaging;
import android.widget.RemoteViews; import com.bluebubbles.messaging.IViewUpdateCallback; import com.bluebubbles.messaging.IKeyboardHandle; import com.bluebubbles.messaging.MadridMessage; import com.bluebubbles.messaging.IMessageViewHandle;
interface IMadridExtension { RemoteViews keyboardOpened(in IViewUpdateCallback callback,in IKeyboardHandle handle,in int userCount); void keyboardClosed(); void didTapTemplate(in MadridMessage message,in IMessageViewHandle handle,in int userCount); RemoteViews getLiveView(in IViewUpdateCallback callback,in MadridMessage message,in IMessageViewHandle handle,in int userCount); void messageUpdated(in MadridMessage message); }
