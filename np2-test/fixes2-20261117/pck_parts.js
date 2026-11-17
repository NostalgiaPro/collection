/* index.pck is over GitHub's 100 MB file limit, so it is stored in 45 MB parts and stitched back together here as a stream. */
(function(){
  var PARTS = ["index.pck.part00","index.pck.part01","index.pck.part02"];
  var realFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    if (!/(^|\/)index\.pck(\?|$)/.test(url)) return realFetch(input, init);
    var i = 0, reader = null;
    var stream = new ReadableStream({
      pull: function(ctrl){
        function next(){
          if (reader) return reader.read().then(function(r){
            if (r.done){ reader = null; return next(); }
            ctrl.enqueue(r.value);
          });
          if (i >= PARTS.length){ ctrl.close(); return Promise.resolve(); }
          return realFetch(PARTS[i++]).then(function(res){
            if (!res.ok) throw new Error("pck part " + res.status);
            reader = res.body.getReader(); return next();
          });
        }
        return next();
      }
    });
    return Promise.resolve(new Response(stream, {status:200, headers:{"Content-Type":"application/octet-stream","Content-Length":"133581596"}}));
  };
})();
