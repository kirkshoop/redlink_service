'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _azure = require('azure');

var _azure2 = _interopRequireDefault(_azure);

var _rx = require('rx');

var _rx2 = _interopRequireDefault(_rx);

var _superagent = require('superagent');

var _superagent2 = _interopRequireDefault(_superagent);

var _superagentXml2jsparser = require('superagent-xml2jsparser');

var _superagentXml2jsparser2 = _interopRequireDefault(_superagentXml2jsparser);

//require('superagent-proxy')(superagent);

var _eventhubsJs = require('eventhubs-js');

var _eventhubsJs2 = _interopRequireDefault(_eventhubsJs);

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var Observable = _rx2['default'].Observable;

var port = process.env.PORT || 8111;

_http2['default'].createServer(function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World\n');
}).listen(port);

var AppID = process.env.RlAppid;
var AppAuth = process.env.RlAppAuth;
var Username = process.env.RlUsername;
var Password = process.env.RlPassword;
var Session = process.env.RlSession;

var eventHubNamespace = process.env.EbNamespace;
var eventHubName = process.env.EbName;

var eventHubPolicyName = process.env.EbPolicyName;
var eventHubPolicyKey = process.env.EbPolicyKey;

// begin https://raw.githubusercontent.com/noodlefrenzy/event-hub-client/master/lib/saToken.js

//
// Copyright (c) Microsoft and contributors.  All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

var crypto = require('crypto');
var utf8 = require('utf8');

/**
 * Creates a new Shared Access Token for use in the Authorization header of ServiceBus/EventHub calls.
 *
 * @param {string} namespace    The ServiceBus Namespace to use.
 * @param {string} hubName      The EventHub name.
 * @param {string} saName       The Shared Access Policy name.
 * @param {string} saKey        The Shared Access Policy key.
 * @return {string}             A Shared Access token string.
 *
 */
function createSharedAccessToken(namespace, hubName, saName, saKey) {
  if (!namespace || !hubName || !saName || !saKey) {
    throw "Missing required parameter";
  }

  var uri = 'https://' + namespace + '.servicebus.windows.net/' + hubName + '/';

  var encoded = encodeURIComponent(uri);

  var epoch = new Date(1970, 1, 1, 0, 0, 0, 0);
  var now = new Date();
  var year = 365 * 24 * 60 * 60;
  var ttl = (now.getTime() - epoch.getTime()) / 1000 + year * 5;

  var signature = encoded + '\n' + ttl;
  var signatureUTF8 = utf8.encode(signature);
  var hash = crypto.createHmac('sha256', saKey).update(signatureUTF8).digest('base64');

  return 'SharedAccessSignature sr=' + encoded + '&sig=' + encodeURIComponent(hash) + '&se=' + ttl + '&skn=' + saName;
}
// end https://raw.githubusercontent.com/noodlefrenzy/event-hub-client/master/lib/saToken.js

var eventHubSasToken = createSharedAccessToken(eventHubNamespace, eventHubName, eventHubPolicyName, eventHubPolicyKey);

_eventhubsJs2['default'].init({
  hubNamespace: eventHubNamespace,
  hubName: eventHubName,
  sasToken: eventHubSasToken
});

var RedlinkApi = (function () {
  function RedlinkApi(AppId, AppAuth) {
    _classCallCheck(this, RedlinkApi);

    this.uri = 'https://tccna.honeywell.com';
    this.appid = AppId;
    this.appauth = AppAuth;
    this.login$ = Observable.fromNodeCallback(this.login, this);
    this.getLocations$ = Observable.fromNodeCallback(this.getLocations, this);
    this.getThermostat$ = Observable.fromNodeCallback(this.getThermostat, this);
  }

  _createClass(RedlinkApi, [{
    key: 'call',
    value: function call(path, form, cb) {
      _superagent2['default'].post(this.uri + '/ws/MobileV2.asmx' + path).
      //      proxy(process.env.https_proxy).
      type('form').send(form).accept('xml').parse(_superagentXml2jsparser2['default']).end(function (err, resp) {
        cb(err, resp && resp.body);
      });
    }
  }, {
    key: 'login',
    value: function login(username, password, cb) {
      this.call('/AuthenticateUserLogin', { username: username, password: password, applicationID: this.appid, applicationVersion: '2', uiLanguage: 'English' }, cb);
    }
  }, {
    key: 'getLocations',
    value: function getLocations(session, cb) {
      this.call('/GetLocations', { sessionID: session }, cb);
    }
  }, {
    key: 'getThermostat',
    value: function getThermostat(session, thermostat, cb) {
      this.call('/GetThermostat', { sessionID: session, thermostatID: thermostat }, cb);
    }
  }]);

  return RedlinkApi;
})();

;

var api = new RedlinkApi(AppID, AppAuth);

var thermostat$ = function thermostat$(session$, period) {
  console.log('get thermostat data every ' + period / 1000 + 's');
  return session$.flatMap(function (session) {
    console.log('using session: ' + session);
    return Observable.interval(period).startWith(0).flatMap(function (_) {
      return api.getLocations$(session).flatMap(function (locations) {
        return Observable.of(locations.GetLocationsResult.Locations).flatMap(function (location) {
          return Observable.of(location[0].LocationInfo[0].Thermostats).map(function (thermostat) {
            location[0].LocationInfo[0].Thermostats = undefined;
            return { location: location[0].LocationInfo[0], thermostat: thermostat[0].ThermostatInfo[0] };
          }).tap(function (thermostatAt) {
            var location = thermostatAt.location;
            var thermostat = thermostatAt.thermostat;
            var UI = thermostat.UI[0];
            var Fan = thermostat.Fan[0];
            var Unit = UI.DisplayedUnits[0];
            var message = {
              create: UI.Created[0],
              locationName: location.Name[0],
              unit: Unit,
              outdoorTemp: '' + Number(UI.OutdoorTemp[0]),
              thermostatName: thermostat.UserDefinedDeviceName[0],
              thermostatTemp: '' + Number(UI.DispTemperature[0]),
              thermostatHumidity: UI.IndoorHumidity[0],
              heatSetPoint: '' + Number(UI.HeatSetpoint[0]),
              coolSetPoint: '' + Number(UI.CoolSetpoint[0]),
              statusHeat: UI.StatusHeat[0],
              statusCool: UI.StatusCool[0],
              fanPosition: Fan.Position[0],
              fanIsRunning: Fan.IsFanRunning[0]['$']['xsi:nil'] === "true"
            };
            _eventhubsJs2['default'].sendMessage({
              message: message,
              deviceId: thermostatAt.thermostat.ThermostatID[0]
            });
          });
        });
      });
    });
  });
};

var withNewLogin$ = function withNewLogin$(e) {
  console.log(e);
  console.log('new login..');
  var login = api.login$(Username, Password).retry().map(function (body) {
    console.log("logged in: " + body.AuthenticateLoginResult.SessionID[0]);
    return body.AuthenticateLoginResult.SessionID[0];
  });
  return thermostat$(login, 1000 * 10)['catch'](withNewLogin$);
};

thermostat$(Observable.of(Session), 1000 * 10)['catch'](withNewLogin$).subscribe(function (thermostatAt) {
  var location = thermostatAt.location;
  console.log(location.CurrentWeather[0]);
  var thermostat = thermostatAt.thermostat;
  var UI = thermostat.UI[0];
  var Unit = UI.DisplayedUnits[0];

  console.log('Now: ' + new Date().toGMTString() + ', At: ' + UI.Created[0] + ', Outside - ' + location.Name[0] + ': ' + Number(UI.OutdoorTemp[0]) + Unit + ', Inside - ' + thermostat.UserDefinedDeviceName[0] + ': ' + Number(UI.DispTemperature[0]) + Unit);
}, function (error) {
  console.log("failed - " + error);
});

//# sourceMappingURL=server.js.map