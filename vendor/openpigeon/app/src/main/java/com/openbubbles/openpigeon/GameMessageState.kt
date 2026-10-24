package com.openbubbles.openpigeon

class GameMessageState {
    @Volatile private var value: MutableMap<String, String> = mutableMapOf()

    var current: MutableMap<String, String>
        get() = value
        set(message) { synchronized(this) { value = message } }

    fun commitAcknowledged(expected: MutableMap<String, String>, update: MutableMap<String, String>) {
        synchronized(this) {
            if (value === expected) value = update
        }
    }
}
