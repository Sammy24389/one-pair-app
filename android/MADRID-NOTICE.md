# Madrid interoperability declarations

The AIDL declarations in app/src/main/aidl/com/bluebubbles/messaging describe the Madrid Binder protocol, maintained by BlueBubbles/OpenBubbles. These declarations were independently formatted from the published API schema. Canonical interface source: https://github.com/OpenBubbles/openbubbles-app/tree/rustpush/android/app/src/main/aidl/com/bluebubbles/messaging (Apache License 2.0). The complete license is included at app/src/main/assets/licenses/madrid-apache-2.0.txt.

Compatibility was checked against OpenPigeon wordhunt commit 238c463241ee4fcc1883c3d5989f04082fcbd03b, including structured Parcelable field order. No OpenPigeon games, artwork, models, sounds or implementation source are bundled. Users install and update OpenPigeon separately. The upstream integration instructions explicitly permit separate-app hosts: https://github.com/OpenBubbles/OpenPigeon/blob/wordhunt/Integration.md.
