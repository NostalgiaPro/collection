# vendor

`three-0.160.0/three.module.min.js` is the three.js library, version 0.160.0, MIT license (LICENSE beside it),
copied unchanged from the npm package `three@0.160.0`.

The opening cutscene and the rescue cutscene import three.js. Up to v10 the built pages fetched it from
unpkg.com every time they ran, so the private build needed that outside site to be reachable and did
nothing but show a black frame when it was not. From v11 `godot/tools/wrap_web_intro.py` copies this folder
into the web build and points the two pages at it, so the build runs with no outside site at all.
The two source pages in `web_intro/intro` and `web_intro/rescue` are not edited; only the built copies are.
