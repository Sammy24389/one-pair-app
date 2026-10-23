// Independently declared Madrid interoperability contract; see android/MADRID-NOTICE.md.
package com.bluebubbles.messaging;
parcelable MadridMessage { String messageGuid; @nullable String ldText; String url; @nullable String session; @nullable String imageBase64; @nullable String imageSubtitle; @nullable String imageTitle; @nullable String caption; @nullable String secondaryCaption; @nullable String tertiaryCaption; @nullable String subcaption; boolean isLive; }
