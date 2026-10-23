package app.onepair.p2p;

import java.nio.charset.StandardCharsets;

final class OpenPigeonPayload {
    private OpenPigeonPayload() {}

    static boolean valid(String guid, String session, String url) {
        return identifier(guid, 100) && identifier(session, 200) && url != null
            && url.startsWith("data:?") && url.getBytes(StandardCharsets.UTF_8).length <= 90000;
    }

    private static boolean identifier(String value, int max) {
        return value != null && !value.isEmpty() && value.length() <= max && value.matches("[!-~]+");
    }
}
