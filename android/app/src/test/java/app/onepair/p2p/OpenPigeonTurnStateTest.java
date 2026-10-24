package app.onepair.p2p;

import com.openbubbles.openpigeon.GameMessageState;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public class OpenPigeonTurnStateTest {
    private Map<String, String> turn(String number, String sender) {
        Map<String, String> value = new HashMap<>();
        value.put("num", number); value.put("sender", sender);
        return value;
    }

    @Test public void acceptedLocalTurnBecomesTheCurrentSnapshot() {
        GameMessageState state = new GameMessageState();
        Map<String, String> base = turn("1", "creator");
        Map<String, String> local = turn("2", "invitee");
        state.setCurrent(base);
        state.commitAcknowledged(base, local);
        assertSame(local, state.getCurrent());
    }

    @Test public void delayedLocalAcknowledgementCannotReplaceTheOpponentsNewerTurn() {
        GameMessageState state = new GameMessageState();
        Map<String, String> base = turn("1", "creator");
        state.setCurrent(base);
        Map<String, String> local = turn("2", "invitee");
        Map<String, String> remote = turn("3", "creator");
        state.setCurrent(remote);
        state.commitAcknowledged(base, local);
        assertSame(remote, state.getCurrent());
        assertEquals("3", state.getCurrent().get("num"));
    }

    @Test public void aDuplicateAcknowledgementCannotRollBackAReceivedSnapshot() {
        GameMessageState state = new GameMessageState();
        Map<String, String> base = turn("1", "creator");
        Map<String, String> local = turn("2", "invitee");
        state.setCurrent(base); state.commitAcknowledged(base, local);
        Map<String, String> received = turn("3", "creator");
        state.setCurrent(received); state.commitAcknowledged(base, local);
        assertSame(received, state.getCurrent());
    }
}
