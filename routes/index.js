var uuid = require('uuid');
var url = require('url');
var router = require('express-promise-router')();
var SongFinder = require("bpm2spotify").default;
var SpotifyWebApi = require('spotify-web-api-node');
require('string.prototype.repeat');

const DANCE_LINE_LENGTH = 15;

const songfinder = new SongFinder();
const spotifyApi = new SpotifyWebApi();

module.exports = function (app, addon) {
  var hipchat = require('../lib/hipchat')(addon);
  app.use('/', router);

  // simple healthcheck
  app.get('/healthcheck', function (req, res) {
    res.send('OK');
  });

  app.get('/gavin', function(req, res) {
    res.render('dialog');
  });

  app.get('/', function (req, res) {
    var homepage = url.parse(addon.descriptor.links.homepage);
    if (homepage.hostname === req.hostname && homepage.path === req.path) {
      res.render('homepage', addon.descriptor);
    } else {
      res.redirect(addon.descriptor.links.homepage);
    }
  });

  app.get('/config', addon.authenticate(), function (req, res) {
      res.render('config', req.context);
  });

  app.get('/dialog', addon.authenticate(), function (req, res) {
    res.render('dialog', {
      identity: req.identity
    });
  });

  app.post('/start_party', addon.authenticate(), function (req, res) {
    const emoticon = req.body.emoticon;
    return songfinder.getRandomSong(123)
      .then(song => {
        const trackId = song.spotifyUrl.split('/').pop();
        return spotifyApi.getTrack(trackId)
        .then(track => {
          track = track.body;
          const message = `<a href="${song.spotifyUrl}">${track.artists[0].name} - ${track.album.name} - ${track.name}</a>`;
          var card = {
            /*
            style: 'link',
            url: song.spotifyUrl,
            */
            style: 'media',
            url: track.preview_url + '?filename=preview.mp3',
            id: uuid.v4(),
            title: track.name,
            description: {
              format: 'html',
              value: message
            },
            icon: { 'url': emoticon.url },
            /*attributes: [
              { label: 'Preview', url: track.preview_url, value: { label: 'Preview' } }
            ]*/
          };
          const opts = { options: { color: 'random', format: 'html' } };
          return hipchat.sendMessage(
            req.clientInfo,
            req.identity.roomId,
            `(${emoticon.shortcut}) ${message}`,
            opts,
            card
          );
        });
      })
      .then(() => res.json({ status: "ok" }))
      .catch(err => {
        console.log('err', err);
        const msg = `Oops. Something crashed, couldn't dance /o\ \n Error was: ${err.message || err}`
        hipchat.sendMessage(req.clientInfo, req.identity.roomId, msg);
        res.status(500).send({ status: "error", message: msg });
      });
  });

  const getClientEmoticonsSettings = (/*clientKey*/) => {
    return Promise.resolve({
      'partyparrot': { bpm: 149 },
      'nyancat': { bpm: 145 },
      'wizard': { bpm: 106 },
      'sharkdance': { bpm: 123 },
      'mario': { bpm: 123 },
      'megaman': { bpm: 150 },
      'boom': { bpm: 111 },
      'whynotboth': { bpm: 111 },
      'disappear': { bpm: 111 }
    });
  }

  app.get('/emoticons', addon.authenticate(), function (req, res) {
    return Promise.all([
      hipchat.getEmoticons(req.clientInfo),
      getClientEmoticonsSettings(req.clientInfo)
    ]).then(values => {
      const [allEmoticons, savedEmoticons] = values;
      allEmoticons.body.items.forEach(emoji => {
        if (savedEmoticons[emoji.shortcut]) {
          emoji.bpm = savedEmoticons[emoji.shortcut].bpm;
        }
      });
      return res.json(allEmoticons.body.items)
    }).catch(err => {
      console.trace('Error handling emoticons', err);
      res.status(500).send(err);
    });
  });

  // Notify the room that the add-on was installed. To learn more about
  // Connect's install flow, check out:
  // https://developer.atlassian.com/hipchat/guide/installation-flow
  addon.on('installed', function (clientKey, clientInfo, req) {
    hipchat.sendMessage(clientInfo, req.body.roomId, 'The ' + addon.descriptor.name + ' add-on has been installed in this room');
  });

  // Clean up clients when uninstalled
  addon.on('uninstalled', function (id) {
    addon.settings.client.keys(id + ':*', function (err, rep) {
      rep.forEach(function (k) {
        addon.logger.info('Removing key:', k);
        addon.settings.client.del(k);
      });
    });
  });
};
