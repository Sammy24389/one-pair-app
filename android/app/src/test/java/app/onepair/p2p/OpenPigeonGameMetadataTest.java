package app.onepair.p2p;

import com.openbubbles.openpigeon.Cryption;
import java.net.URLEncoder;
import org.junit.Test;
import static org.junit.Assert.*;

public class OpenPigeonGameMetadataTest {
    private String payload(String query) throws Exception {
        return "data:?ver=52&data=" + URLEncoder.encode(Cryption.INSTANCE.encrypt(query), "UTF-8");
    }

    @Test public void recognizesWinsLossesAndDrawsFromActualEncryptedGameState() throws Exception {
        for (String result : new String[]{"1", "0", "-1"}) {
            assertTrue(OpenPigeonGameMetadata.completed(payload("?game=connect&winner=player%2Bid%7C" + result)));
        }
    }

    @Test public void leavesIncompleteOrUnknownStatesActive() throws Exception {
        assertFalse(OpenPigeonGameMetadata.completed(payload("?game=connect&sender=creator&player=2")));
        for (String winner : new String[]{"", "player", "%7C1", "player%7C2", "player%7C1%7Cextra"}) {
            assertFalse(OpenPigeonGameMetadata.completed(payload("?winner=" + winner)));
        }
        assertFalse(OpenPigeonGameMetadata.completed(null));
        assertFalse(OpenPigeonGameMetadata.completed("data:?data=%invalid"));
        assertFalse(OpenPigeonGameMetadata.completed("https://example.com/?winner=player%7C1"));
    }
}
