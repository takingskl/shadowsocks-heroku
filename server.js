// Generated by CoffeeScript 1.8.0
(function() {
  var Encryptor, KEY, METHOD, PORT, WebSocket, WebSocketServer, config, configContent, configFile, configFromArgs, fs, http, inetNtoa, k, net, options, parseArgs, path, timeout, v, wss;

  net = require("net");

  fs = require("fs");

  path = require("path");

  http = require("http");

  WebSocket = require('ws');

  WebSocketServer = WebSocket.Server;

  parseArgs = require("minimist");

  Encryptor = require("./encrypt").Encryptor;

  options = {
    alias: {
      'r': 'remote_port',
      'k': 'password',
      'c': 'config_file',
      'm': 'method'
    },
    string: ['password', 'method', 'config_file'],
    "default": {
      'remote_port': process.env.PORT || 8080,
      'password': process.env.KEY,
      'method': process.env.METHOD,
      'config_file': path.resolve(__dirname, "config.json")
    }
  };

  inetNtoa = function(buf) {
    return buf[0] + "." + buf[1] + "." + buf[2] + "." + buf[3];
  };

  configFromArgs = parseArgs(process.argv.slice(2), options);

  configFile = configFromArgs.config_file;

  configContent = fs.readFileSync(configFile);

  config = JSON.parse(configContent);

  for (k in configFromArgs) {
    v = configFromArgs[k];
    config[k] = v;
  }

  timeout = Math.floor(config.timeout * 1000);

  PORT = config.remote_port;

  KEY = config.password;

  METHOD = config.method;

  wss = new WebSocketServer({
    port: PORT
  });

  wss.on("connection", function(ws) {
    var addrLen, cachedPieces, encryptor, headerLength, remote, remoteAddr, remotePort, stage;
    console.log("server connected");
    console.log("concurrent connections:", wss.clients.length);
    encryptor = new Encryptor(KEY, METHOD);
    stage = 0;
    headerLength = 0;
    remote = null;
    cachedPieces = [];
    addrLen = 0;
    remoteAddr = null;
    remotePort = null;
    ws.on("message", function(data, flags) {
      var addrtype, buf, e;
      data = encryptor.decrypt(data);
      if (stage === 5) {
        remote.write(data);
        return;
      }
      if (stage === 0) {
        try {
          addrtype = data[0];
          if (addrtype === 3) {
            addrLen = data[1];
          } else if (addrtype !== 1) {
            console.warn("unsupported addrtype: " + addrtype);
            ws.close();
            return;
          }
          if (addrtype === 1) {
            remoteAddr = inetNtoa(data.slice(1, 5));
            remotePort = data.readUInt16BE(5);
            headerLength = 7;
          } else {
            remoteAddr = data.slice(2, 2 + addrLen).toString("binary");
            remotePort = data.readUInt16BE(2 + addrLen);
            headerLength = 2 + addrLen + 2;
          }
          remote = net.connect(remotePort, remoteAddr, function() {
            var i, piece;
            console.log("connecting", remoteAddr);
            i = 0;
            while (i < cachedPieces.length) {
              piece = cachedPieces[i];
              remote.write(piece);
              i++;
            }
            cachedPieces = null;
            return stage = 5;
          });
          remote.on("data", function(data) {
            data = encryptor.encrypt(data);
            if (ws.readyState === WebSocket.OPEN) {
              return ws.send(data, {
                binary: true
              });
            }
          });
          remote.on("end", function() {
            ws.emit("close");
            return console.log("remote disconnected");
          });
          remote.on("error", function(e) {
            ws.emit("close");
            return console.log("remote: " + e);
          });
          remote.setTimeout(timeout, function() {
            remote.destroy();
            return ws.close();
          });
          if (data.length > headerLength) {
            buf = new Buffer(data.length - headerLength);
            data.copy(buf, 0, headerLength);
            cachedPieces.push(buf);
            buf = null;
          }
          return stage = 4;
        } catch (_error) {
          e = _error;
          console.warn(e);
          if (remote) {
            remote.destroy();
          }
          return ws.close();
        }
      } else {
        if (stage === 4) {
          return cachedPieces.push(data);
        }
      }
    });
    ws.on("close", function() {
      console.log("server disconnected");
      console.log("concurrent connections:", wss.clients.length);
      if (remote) {
        return remote.destroy();
      }
    });
    return ws.on("error", function(e) {
      console.warn("server: " + e);
      console.log("concurrent connections:", wss.clients.length);
      if (remote) {
        return remote.destroy();
      }
    });
  });

}).call(this);
