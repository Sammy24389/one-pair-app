# Importing WhatsApp stickers into Padi

Padi imports individual local sticker media files. It does not connect to WhatsApp, sync favourites, read private app storage, import pack links, or unpack .wastickers/proprietary packs. WhatsApp uses WebP for its standard static/animated sticker artwork: https://github.com/WhatsApp/stickers . Retaining the original animated WebP preserves its frames; screenshots lose animation and transparency.

Android, when accessible in your file manager: send/download the sticker in WhatsApp, then look under Internal storage / Android / media / com.whatsapp / WhatsApp / Media / WhatsApp Stickers. This location and access vary with Android/WhatsApp/file-manager versions; it is not guaranteed. Copy the chosen .webp to Downloads (leave WhatsApp's original alone). Alternatively obtain the original supported media from its creator or a desktop Save image option if available.

In Padi: open a paired chat, open Emoji & stickers, select Stickers, choose Add sticker, then select the copied file. Still images open Crop sticker; adjust zoom/position, choose Crop and add or Keep full image. Animated WebP/GIF/APNG and supported MP4/WebM clips bypass still-image cropping and retain motion. Select the saved tile to send. Recipients can use Add to stickers to save their own copy.

iPhone: Files cannot normally browse WhatsApp's private storage. Use an actual exported/shared media file from the creator or another available save method, save it to Files, then select it in Padi. Adding to WhatsApp favourites or sharing a pack link alone does not produce an importable file. Protected, vector/Lottie or proprietary packs require an independently exported supported media file. MP4/WebM are Padi video stickers; this is not a WhatsApp video-sticker export API.

Use files you are allowed to reuse. File type, dimensions, size and video duration limits apply; rejected files leave the library unchanged. Older Padi clients need updating to display video stickers.
