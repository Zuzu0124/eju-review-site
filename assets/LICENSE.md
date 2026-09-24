# Original landscape

morning-mist.svg and morning-mist-dark.svg are original vector artwork authored for this redesign.
No reference-app artwork, downloaded photographs, proprietary fonts or third-party
image assets are included. The artwork may be used, modified and redistributed
with this repository without attribution (CC0-1.0 dedication).

# Book typography

Noto Serif SC and Noto Serif JP are distributed under the SIL Open Font License 1.1;
see [NotoSerifSC-OFL.txt](NotoSerifSC-OFL.txt) and [NotoSerifJP-OFL.txt](NotoSerifJP-OFL.txt)
for the complete notices and licenses. Upstream: https://github.com/notofonts/noto-cjk
and https://github.com/google/fonts/tree/main/ofl/notoserifsc (and notoserifjp).

noto-serif-cjk-v1.css exposes one CSS family, Noto Serif CJK, at weights 400–500.
It pins Google Fonts' SC v35 WOFF2 subsets, adding the JP ranges missing from SC
to cover Japanese kanji and kana without overlapping the primary glyphs.
Binary fonts are unmodified; the original font family names remain in the files.
The fonts are fetched from fonts.gstatic.com by Unicode range, only as needed;
there is no runtime Google Fonts CSS request or text-specific font request.
The same family covers Chinese characters, Japanese kana and Latin book titles.
The font uses swap so text stays readable while loading or if the CDN is unavailable.
