import Foundation

/// What the app adds to the pages it shows, and the messages they send back
/// through `window.webkit.messageHandlers.voidkoi`. The contract for the web side
/// is in README.md.
enum Bridge {
    static let handler = "voidkoi"

    /// Added to every page as it starts. The window takes the colour of any page;
    /// the rest is only for the server's own pages.
    static func script(server: URL) -> String {
        let data = (try? JSONEncoder().encode(Address.origin(server))) ?? Data("\"\"".utf8)
        return source.replacingOccurrences(of: "__SERVER__", with: String(decoding: data, as: UTF8.self))
    }

    /// Clicks the page's own file picker, once the page is running: an input React
    /// hasn't taken over yet (no props key) would drop the files.
    static func clickPicker(folder: Bool) -> String {
        let selector = folder ? "input[type=file][webkitdirectory]" : "input[type=file][multiple]:not([webkitdirectory])"
        return """
        (() => {
          const input = document.querySelector('\(selector)');
          if (!input || document.readyState !== 'complete') return false;
          if (!Object.keys(input).some(key => key.startsWith('__reactProps'))) return false;
          input.click();
          return true;
        })()
        """
    }

    /// The page's search box, wherever the app keeps it.
    static let focusSearch = """
    (() => {
      const shown = element => element && element.offsetParent !== null;
      const field = [...document.querySelectorAll('input[type=search]')].find(shown)
        || [...document.querySelectorAll('svg.lucide-search')].map(icon => icon.parentElement && icon.parentElement.querySelector('input')).find(shown)
        || [...document.querySelectorAll('input[placeholder]')].find(input => shown(input) && /search|buscar/i.test(input.placeholder));
      if (!field) return false;
      field.focus();
      if (field.select) field.select();
      return true;
    })()
    """

    private static let source = #"""
    (() => {
      if (window.__voidkoi) return;
      window.__voidkoi = true;
      const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.voidkoi;
      if (!handler) return;
      const send = message => {
        try {
          return Promise.resolve(handler.postMessage(message)).catch(() => undefined);
        } catch (_) {
          return Promise.resolve(undefined);
        }
      };

      // The page's colour, for the window around it: the suite's own --canvas,
      // which changes as soon as the theme does, else the body's background.
      let last = '';
      const sendColor = () => {
        const root = document.documentElement;
        if (!root) return;
        const style = getComputedStyle(root);
        const message = {
          type: 'color',
          canvas: style.getPropertyValue('--canvas').trim(),
          body: document.body ? getComputedStyle(document.body).backgroundColor : '',
          root: style.backgroundColor,
          scheme: style.colorScheme || '',
        };
        const key = [message.canvas, message.body, message.root, message.scheme].join('|');
        if (key === last) return;
        last = key;
        send(message);
      };
      const soon = () => {
        setTimeout(sendColor, 0);
        setTimeout(sendColor, 400);
      };
      const watch = () => {
        sendColor();
        const observer = new MutationObserver(soon);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
        if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
      else watch();
      window.addEventListener('load', soon);
      window.addEventListener('pageshow', () => { last = ''; sendColor(); });
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', soon);

      if (location.origin !== __SERVER__) return;

      // Copying goes to the Mac's clipboard, also after the click that asked for it.
      if (navigator.clipboard) {
        navigator.clipboard.writeText = text => send({ type: 'copy', text: String(text) }).then(() => undefined);
      }

      // Printing, and saving as PDF, go to the Mac's print panel.
      window.print = () => { send({ type: 'print' }); };

      // A blob a page lets go of right after clicking its link may still be downloading.
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = url => { setTimeout(() => revoke(url), 30000); };

      // The Badging API puts its badge on the Dock icon.
      navigator.setAppBadge = count =>
        send(count === undefined ? { type: 'badge' } : { type: 'badge', count: Number(count) || 0 }).then(() => undefined);
      navigator.clearAppBadge = () => send({ type: 'badge', count: 0 }).then(() => undefined);

      // Files dropped where the page takes none go to Files: the app hears of the
      // drop and has the files from the drag. The page's own handlers come first:
      // these decide after them, and leave file inputs and text fields alone.
      let claimed = false;
      const carriesFiles = event => Array.from((event.dataTransfer && event.dataTransfer.types) || []).includes('Files');
      const takesDropsItself = target =>
        target instanceof Element && target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])') !== null;
      const afterThePage = (event, decide) => {
        const listener = later => {
          if (later !== event) return;
          window.removeEventListener(event.type, listener);
          decide();
        };
        window.addEventListener(event.type, listener);
        // A handler that stopped the event took it.
        setTimeout(() => window.removeEventListener(event.type, listener), 0);
      };
      window.addEventListener('dragover', event => {
        if (!carriesFiles(event) || takesDropsItself(event.target)) return;
        afterThePage(event, () => {
          claimed = !event.defaultPrevented;
          if (!claimed) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        });
      }, true);
      // Whether the drag carries files was settled over it: a drop may not say again.
      window.addEventListener('drop', event => {
        if (!claimed) return;
        claimed = false;
        afterThePage(event, () => {
          if (event.defaultPrevented) return;
          event.preventDefault();
          send({ type: 'drop' });
        });
      }, true);

      // Requests the page starts, to tell whether it acted on files a picker took.
      let requests = 0;

      // A file picker took files: tells the app, and whether the page acted on them.
      document.addEventListener('change', event => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files || !input.files.length) return;
        const before = requests;
        const count = input.files.length;
        setTimeout(() => send({ type: 'picked', count, accepted: requests > before }), 0);
      }, true);

      // Uploads as the page sends them, for the Dock icon: files sent whole
      // (POST …/uploads/direct), and files sent in pieces (POST …/uploads,
      // PUT …/uploads/<id>/chunks/<n>, POST …/uploads/<id>/complete).
      const uploads = new Map();
      let finished = 0;
      let sequence = 0;
      let timer = null;
      const report = () => {
        timer = null;
        let total = 0;
        let loaded = 0;
        for (const upload of uploads.values()) {
          let sent = upload.loaded;
          for (const value of upload.chunks.values()) sent += value;
          total += upload.total;
          loaded += Math.min(sent, upload.total);
        }
        send({ type: 'uploads', active: uploads.size, total, loaded, finished });
        if (uploads.size === 0) finished = 0;
      };
      const schedule = now => {
        if (now) {
          clearTimeout(timer);
          report();
        } else if (timer === null) {
          timer = setTimeout(report, 250);
        }
      };
      const pathOf = url => {
        try { return new URL(String(url), location.href).pathname; } catch (_) { return ''; }
      };

      const open = XMLHttpRequest.prototype.open;
      const sendRequest = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        this.__voidkoi = { method: String(method).toUpperCase(), path: pathOf(url) };
        return open.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        requests += 1;
        try {
          const request = this.__voidkoi;
          const size = body && typeof body.size === 'number' ? body.size : 0;
          if (request && request.method === 'POST' && /\/uploads\/direct$/.test(request.path)) {
            const id = 'direct-' + (sequence += 1);
            let aborted = false;
            uploads.set(id, { total: size, loaded: 0, chunks: new Map() });
            this.upload.addEventListener('progress', event => {
              const upload = uploads.get(id);
              if (upload) upload.loaded = event.loaded;
              schedule();
            });
            this.addEventListener('abort', () => { aborted = true; });
            this.addEventListener('loadend', () => {
              if (!uploads.delete(id)) return;
              if (!aborted && this.status === 201) finished += 1;
              schedule(true);
            });
            schedule();
          }
          const chunk = request && request.method === 'PUT' && request.path.match(/\/uploads\/([^/]+)\/chunks\/(\d+)$/);
          const upload = chunk && uploads.get(chunk[1]);
          if (upload) {
            const index = Number(chunk[2]);
            upload.chunks.set(index, 0);
            this.upload.addEventListener('progress', event => {
              if (upload.chunks.has(index)) upload.chunks.set(index, event.loaded);
              schedule();
            });
            this.addEventListener('loadend', () => {
              upload.chunks.delete(index);
              if (this.status >= 200 && this.status < 300) upload.loaded += size;
              schedule();
            });
          }
        } catch (_) {}
        return sendRequest.apply(this, arguments);
      };

      const fetchOriginal = window.fetch;
      window.fetch = function (input, init) {
        requests += 1;
        const result = fetchOriginal.apply(this, arguments);
        try {
          const url = typeof input === 'string' || input instanceof URL ? input : input && input.url;
          const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
          const path = pathOf(url || '');
          if (method === 'POST' && /\/uploads$/.test(path) && init && typeof init.body === 'string') {
            const asked = JSON.parse(init.body);
            result
              .then(response => (response.ok ? response.clone().json() : null))
              .then(session => {
                if (!session || session.id === undefined) return;
                const total = Number(asked.size) || 0;
                const received = Array.isArray(session.received) ? session.received.length : 0;
                uploads.set(String(session.id), {
                  total,
                  loaded: Math.min(total, received * (Number(session.chunkSize) || 0)),
                  chunks: new Map(),
                });
                schedule();
              })
              .catch(() => {});
          }
          let match = method === 'POST' && path.match(/\/uploads\/([^/]+)\/complete$/);
          if (match) {
            const id = match[1];
            result
              .then(response => {
                if (response.ok && uploads.delete(id)) {
                  finished += 1;
                  schedule(true);
                }
              })
              .catch(() => {});
          }
          match = method === 'DELETE' && path.match(/\/uploads\/([^/]+)$/);
          if (match && uploads.delete(match[1])) schedule(true);
        } catch (_) {}
        return result;
      };
    })();
    """#
}
