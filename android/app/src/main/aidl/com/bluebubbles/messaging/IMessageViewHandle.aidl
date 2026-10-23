// Independently declared Madrid interoperability contract; see android/MADRID-NOTICE.md.
package com.bluebubbles.messaging;
import com.bluebubbles.messaging.MadridMessage; import com.bluebubbles.messaging.ITaskCompleteCallback; interface IMessageViewHandle { void updateMessage(in MadridMessage message,in ITaskCompleteCallback callback); void setSuppressNotifications(boolean suppress); void lock(); void unlock(); }
