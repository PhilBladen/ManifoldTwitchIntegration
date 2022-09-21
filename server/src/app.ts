import * as Packet from 'common/packet-ids';
import { UNFEATURE_MARKET } from 'common/packet-ids';
import { PacketSelectMarket } from 'common/packets';
import cors from 'cors';
import express, { Express } from 'express';
import moment from 'moment';
import { AddressInfo } from 'net';
import path from 'path';
import { Server } from 'socket.io';
import registerAPIEndpoints from './api';
import DockClient from './clients/dock';
import OverlayClient from './clients/overlay';
import { IS_DEV, PORT } from './envs';
import AppFirestore from './firestore';
import log from './logger';
import * as Manifold from './manifold-api';
import { Market } from './market';
import TwitchBot from './twitch-bot';
import User from './user';

export default class App {
  private readonly app: Express;
  io: Server;
  readonly bot: TwitchBot;
  readonly firestore: AppFirestore;

  selectedMarketMap: { [twitchChannel: string]: Market } = {};

  autoUnfeatureTimers: { [twitchChannel: string]: NodeJS.Timeout } = {};

  constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.bot = new TwitchBot(this);
    this.firestore = new AppFirestore();

    moment.updateLocale('en', {
      relativeTime: {
        future: 'in %s',
        past: '%s ago',
        s: '<1m',
        ss: '%ss',
        m: '1m',
        mm: '%dm',
        h: '1h',
        hh: '%dh',
        d: '1d',
        dd: '%dd',
        M: '1m',
        MM: '%dM',
        y: '1y',
        yy: '%dY',
      },
    });
  }

  public getMarketForTwitchChannel(channel: string) {
    return this.selectedMarketMap[channel];
  }

  public getChannelForMarketID(marketID: string) {
    for (const channel of Object.keys(this.selectedMarketMap)) {
      const market = this.selectedMarketMap[channel];
      if (market.data.id == marketID) return channel;
    }
    return null;
  }

  public async selectMarket(channel: string, id: string, sourceDock?: DockClient): Promise<Market> {
    this.unfeatureCurrentMarket(channel, sourceDock);

    if (id) {
      if (sourceDock) {
        sourceDock.socket.broadcast.to(channel).emit(Packet.SELECT_MARKET_ID, id);
      } else {
        this.io.to(channel).emit(Packet.SELECT_MARKET_ID, id);
      }

      const marketData = await Manifold.getFullMarketByID(id);
      if (!marketData || marketData.isResolved) throw new Error('Attempted to feature invalid market');
      const market = new Market(this, marketData, channel);
      this.selectedMarketMap[channel] = market;
      log.debug(`Selected market '${market.data.question}' for channel '${channel}'`);
      if (sourceDock) {
        sourceDock.socket.broadcast.to(channel).emit(Packet.SELECT_MARKET, market.data as PacketSelectMarket);
      } else {
        this.io.to(channel).emit(Packet.SELECT_MARKET, market.data as PacketSelectMarket);
      }
      return market;
    }
  }

  public async unfeatureCurrentMarket(channel: string, sourceDock?: DockClient) {
    if (this.autoUnfeatureTimers[channel]) {
      clearTimeout(this.autoUnfeatureTimers[channel]);
      delete this.autoUnfeatureTimers[channel];
    }

    const existingMarket = this.getMarketForTwitchChannel(channel);
    if (existingMarket) {
      existingMarket.continuePolling = false;
      delete this.selectedMarketMap[channel];
    }

    if (sourceDock) {
      sourceDock.socket.broadcast.to(channel).emit(Packet.UNFEATURE_MARKET);
    } else {
      this.io.to(channel).emit(UNFEATURE_MARKET);
    }
  }

  async getUserForTwitchUsername(twitchUsername: string): Promise<User> {
    return this.firestore.getUserForTwitchUsername(twitchUsername);
  }

  public marketResolved(market: Market) {
    const channel = this.getChannelForMarketID(market.data.id);
    this.autoUnfeatureTimers[channel] = setTimeout(() => {
      this.selectMarket(channel, null);
      this.io.to(channel).emit(UNFEATURE_MARKET);
    }, 24000);
    this.bot.resolveMarket(channel, market);
  }

  async launch() {
    await this.bot.connect();

    if (!IS_DEV) {
      this.firestore.onDevBotActiveUpdated((d) => {
        if (d.devBotLastActive && d.devBotLastActive > Date.now() - 1000 * 10) {
          this.bot.temporarilyMute();
        }
      });
    } else {
      setInterval(() => this.firestore.updateDevBotLastActive(), 5000);
    }

    const server = this.app.listen(PORT, () => {
      const addressInfo = <AddressInfo>server.address();
      const host = addressInfo.address;
      const port = addressInfo.port;
      log.info('Webserver and websocket listening at http://%s:%s', host, port);
    });

    this.io = new Server(server);
    this.io.use(async (socket, next) => {
      const type = socket.handshake.query.type;
      const controlToken = socket.handshake.query.controlToken;
      if (!(type === 'dock' || type === 'overlay')) {
        next(new Error('Invalid connection type'));
        return;
      }
      const connectedUser = await this.firestore.getUserForControlToken(<string>controlToken);
      if (!connectedUser) {
        next(new Error('No account associated with this control token'));
        return;
      }
      socket.data = connectedUser;
      next();
    });
    this.io.on('connection', (socket) => {
      if (socket.handshake.query.type === 'dock') {
        new DockClient(this, socket);
      } else if (socket.handshake.query.type === 'overlay') {
        new OverlayClient(this, socket);
      }
    });

    registerAPIEndpoints(this, this.app);

    this.app.use(express.static(path.resolve('static'), { index: false, extensions: ['html'] }));
    //!!! this.app.get("*", (req, res) => res.sendFile(path.resolve("static/404.html")));
  }
}
