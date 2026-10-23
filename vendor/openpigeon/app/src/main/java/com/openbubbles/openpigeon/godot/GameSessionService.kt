package com.openbubbles.openpigeon.godot

import android.app.Service
import android.content.Intent
import android.os.Bundle
import android.os.DeadObjectException
import android.os.RemoteException
import android.os.IBinder
import com.openbubbles.openpigeon.util.OpenPigeonLog
import com.openbubbles.openpigeon.GameSession
import com.openbubbles.openpigeon.IGameSession
import com.openbubbles.openpigeon.IUpdateGameSessionCallback
import com.openbubbles.openpigeon.IMessageUpdatedCallback
import com.openbubbles.openpigeon.MadridExtension

class GameSessionService : Service() {
    private class Registration(val callback: IMessageUpdatedCallback, val session: GameSession) {
        lateinit var death: IBinder.DeathRecipient
    }
    private val registrations = mutableMapOf<String, Registration>()

    private fun clearRegistration(id: String, expected: Registration? = null, unlock: Boolean = true) {
        synchronized(registrations) {
            val registration = registrations[id] ?: return
            if (expected != null && registration !== expected) return
            registrations.remove(id)
            runCatching { registration.callback.asBinder().unlinkToDeath(registration.death, 0) }
            registration.session.messageUpdated = {}
            if (unlock) {
                registration.session.unlock()
                registration.session.handle.setSuppressNotifications(false)
            }
        }
    }

    private val binder = object : IGameSession.Stub() {
        override fun getCurrentMessage(id: String?): Bundle {
            OpenPigeonLog.i("openpigeon-GameSessionService", "${MadridExtension.activeSessions}")
            val gameSession: GameSession = MadridExtension.activeSessions[id!!] ?: return Bundle()

            return Bundle().apply {
                for ((key, value) in gameSession.currentMessage) {
                    putString(key, value)
                }
            }
        }

        override fun updateSession(updates: Bundle, mySession: String, callback: IUpdateGameSessionCallback?) {
            val gameSession: GameSession = MadridExtension.activeSessions[mySession] ?: return
            val updateMap = updates.toStringMap()
            gameSession.updateSession(applicationContext, updateMap, mySession) {
                try {
                    callback?.onFinished()
                } catch(e: DeadObjectException) {
                    OpenPigeonLog.e("openpigeon-GameSessionService", "Callback object is dead!")
                }
            }
        }

        override fun getSenderUUID(id: String): String {
            val gameSession: GameSession = MadridExtension.activeSessions[id] ?: return ""
            return gameSession.getGame()!!.getSenderUUID(applicationContext)
        }

        override fun setSuppressNotifications(id: String, suppress: Boolean) {
            val gameSession: GameSession = MadridExtension.activeSessions[id] ?: return
            gameSession.handle.setSuppressNotifications(suppress)
        }

        override fun lockMsgHandle(id: String?) {
            val gameSession: GameSession = MadridExtension.activeSessions[id] ?: return
            gameSession.lock()
        }

        override fun unlockMsgHandle(id: String?) {
            val gameSession: GameSession = MadridExtension.activeSessions[id] ?: return
            gameSession.unlock()
        }

        override fun registerCallback(id: String, callback: IMessageUpdatedCallback?) {
            val gameSession: GameSession = MadridExtension.activeSessions[id] ?: return
            synchronized(registrations) {
                clearRegistration(id, unlock = false)
                if (callback == null) {
                    gameSession.handle.setSuppressNotifications(false)
                    gameSession.unlock()
                    return
                }
                val registration = Registration(callback, gameSession)
                registration.death = IBinder.DeathRecipient { clearRegistration(id, registration) }
                registrations[id] = registration
                try {
                    callback.asBinder().linkToDeath(registration.death, 0)
                } catch (error: RemoteException) {
                    clearRegistration(id, registration)
                    return
                }
                gameSession.messageUpdated = { new: MutableMap<String, String> ->
                    try {
                        callback.onMessageUpdated(Bundle().apply {
                            for ((key, value) in new) putString(key, value)
                        })
                    } catch (error: RemoteException) {
                        clearRegistration(id, registration)
                    }
                }
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder {
        return binder
    }

    override fun onDestroy() {
        synchronized(registrations) {
            registrations.keys.toList().forEach { clearRegistration(it) }
        }
        super.onDestroy()
    }

    private fun Bundle.toStringMap(): Map<String, String> {
        return keySet().mapNotNull { key ->
            getString(key)?.let { key to it }
        }.toMap()
    }
}