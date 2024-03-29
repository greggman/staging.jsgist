import React from 'react';

import EditLine from './EditLine.js';
// import Footer from './Footer.js';
import {storageManager} from '../globals.js';
import GitHub from '../libs/GitHub.js';
import Head from './Head.js';
import Help from './Help.js';
import IDE from './IDE.js';
import Load from './Load.js';
import {isGistId, loadGistFromSrc} from '../libs/loader.js';
import {LogManager} from './Log.js';
import * as model from '../libs/model.js';
import Save from './Save.js';
import ServiceContext from '../ServiceContext.js';
import Settings from './Settings.js';
import Toolbar from './Toolbar.js';
import * as uiModel from '../libs/ui-model.js';
import UserManager from '../libs/UserManager.js';
import * as winMsgMgr from '../libs/WindowMessageManager';
import query from '../libs/start-query.js';

import './App.css';
import { classNames } from '../libs/css-utils.js';

const noJSX = () => [];
const darkMatcher = window.matchMedia('(prefers-color-scheme: dark)');

class App extends React.Component {
  constructor(props) {
    super();
    this.state = {
      path: window.location.pathname,
      dark: darkMatcher.matches,
      fullscreen: !!query.fullscreen,
      loading: false,
      dialog: noJSX,
      gistId: '',
      messages: [],
      userData: {},
      updateVersion: 0,
    };
    this.github = new GitHub();
    this.oauthManager = props.oauthManager;
    this.backupManager = props.backupManager;
    this.logManager = new LogManager();
    this.userManager = new UserManager({
      oauthManager: this.oauthManager,
      github: this.github,
      addError: this.addError,
    });
    this.toolbarFns = {
      handleRun: this.handleRun,
      handleStop: this.handleStop,
      handleSave: this.handleSave,
      handleNew: this.handleNew,
      handleLoad: this.handleLoad,
      handleSettings: this.handleSettings,
      handleFullscreen: this.handleFullscreen,
      handleHelp: this.handleHelp,
    };
  }
  componentWillUnmount() {
    uiModel.unsubscribe(this.handleUIChange);
    this.userManager.cleanup();
  }
  componentDidMount() {
    uiModel.subscribe(this.handleUIChange);
    winMsgMgr.on('newGist', null, this.handleNewGist);
    this.github.addEventListener('userdata', (e) => {
      this.setState({
        userData: e.data,
      });
    });
    model.add('path', window.location.pathname);
    model.subscribe('path', (newValue) => {
      window.history.pushState({}, '', newValue);
      this.setState({
        path: newValue,
      });
    });
    // I still am not sure how I'm supposed to handle this.
    // Putting my model in the state itself seems wrong
    // and doesn't actually help since I'd have to 
    // generate an entirely new state object to change any
    // nested property.
    //
    // Storing the data outside I see no way to tell
    // components to re-render except to call forceUpdate
    // which all the documentation says "if you call this
    // you're doing it wrong".
    //
    // Redux is a joke. 50 lines code needed to set
    // a single field. Repeat those 50 lines for every field.
    // Things like redux-tools make it less to type those
    // 50 lines but they still execute 50 to 500 lines of code
    // just to set a single value.
    model.subscribe(model.filesVersionKey, _ => {
      this.forceUpdate();
    });
    // this is a hack because I can't figure out how to
    // update the CodeMirror areas
    model.subscribe('updateVersion', _ => {
      this.setState({updateVersion: this.state.updateVersion + 1});
    });

    darkMatcher.addEventListener('change', () => {
      this.setState({dark: darkMatcher.matches});
    });

    if (query.newGist) {
      window.history.pushState({}, '', `${window.location.origin}`);
      window.opener.postMessage({type: 'gimmeDaCodez'}, '*');
      return;
    }

    const backup = this.backupManager.getBackup();
    let loaded = false;
    if (backup) {
      try {
        const data = JSON.parse(backup);
        if (data.href === window.location.href) {
          model.setData(data.data);
          const url = new URL(data.href);
          const {src} = Object.fromEntries(new URLSearchParams(url.search).entries());
          if (isGistId(src)) {
            this.setState({gistId: src, gistOwnerId: data.gistOwnerId});
          }
          loaded = true;
          this.addInfo('loaded backup from local storage')
        }
      } catch (e) {
        console.log('bad backup')
      }
      this.backupManager.clearBackup();
    }
    if (!loaded) {
      if (query.src) {
        this.loadData(query.src);
      }
    }
    this.updateTitle();
  }
  componentDidUpdate() {
    this.updateTitle();
  }
  updateTitle() {
    const data = model.getData();
    document.title = data.name || 'jsGist';
  }
  async loadData(src) {
    this.setState({loading: true});
    let success = true;
    let firstTry = true;
    for (;;) {
      try {
        const {data, id, rawData} = await loadGistFromSrc(src, this.github);
        model.setData(data);
        if (id) {
          this.setState({
            gistId: src,
            gistOwnerId: rawData?.owner?.id,
          });
        }
        break;
      } catch (e) {
        if (firstTry) {
          this.userManager.logout();
          firstTry = false;
        } else {
          success = false;
          console.warn(e);
          this.addError(`could not load jsGist: src=${src} ${e}`);
          break;
        }
      }
    }
    this.setState({loading: false});
    if (success) {
      this.handleRun();
    }
  }
  handleUIChange = () => {
    this.forceUpdate();
  }
  handleNewGist = (data) => {
    let success = true;
    try {
      model.setData(data);
      this.backupManager.clearBackup();
    } catch (e) {
      success = false;
      console.warn(e);
      this.addError(`could create new jsGist: ${e}`);
    }
    if (success) {
      this.handleRun();
    }
  };
  addMsg = (msg, className) => {
    switch (className) {
      case 'error':
        console.error(msg);
        break;
      default:
        console.log(msg);
        break;
    }
    this.setState({messages: [{msg: msg.toString(), className}, ...this.state.messages]});
    setTimeout(() => {
      this.setState({messages: this.state.messages.slice(0, this.state.messages.length - 1)});
    }, 5000);
  }
  addInfo = (msg) => this.addMsg(msg, 'info');
  addError = (msg) => this.addMsg(msg, 'error');
  closeDialog = () => {
    this.setState({dialog: noJSX});
  }
  registerRunnerAPI = (api) => {
    this.runnerAPI = api;
    this.handleStop();
  }
  handleNew = async() => {
    //this.backupManager.clearBackup();
    //window.location.href = window.location.origin;  // causes a reload
    window.open('/?newGist=1', '_blank');
  }
  handleRun = async () => {
    this.backupManager.setBackup(JSON.stringify({
      href: window.location.href,
      data: model.getData(),
      gistOwnerId: this.state.gistOwnerId,
    }));
    this.logManager.clear();
    console.clear();
    this.runnerAPI.run(model.getData());
  }
  handleStop = async () => {
    this.runnerAPI.run(model.getBlankData(), true);
  }
  handleSave = async () => {
    this.setState({dialog: this.renderSave});
  }
  handleSettings = () => {
    this.setState({dialog: this.renderSettings});
  }
  handleFullscreen = () => {
    this.setState({fullscreen: !this.state.fullscreen});
  }
  handleHelp = () => {
    this.setState({dialog: this.renderHelp});
  }
  handleLoad = () => {
    this.setState({dialog: this.renderLoad});
  }
  handleOnLoad = async() => {
    this.setState({dialog: noJSX});
    this.handleRun();
  }
  handleOnSave = (gistId) => {
    window.history.pushState({}, '', `${window.location.origin}?src=${gistId}`);
    this.setState({
      gistId,
      gistOwnerId: this.userManager.getUserData().id,
    });
  }
  handleAbort = () => {
    this.abort();
  };
  renderHelp = () => {
    return (<Help onClose={this.closeDialog} />);
  }
  renderSettings = () => {
    return (
      <Settings onClose={this.closeDialog} />
    );
  }
  renderLoad = () => {
    return (
      <Load
        onLoad={this.handleOnLoad}
        onClose={this.closeDialog}
      />
    );
  }
  renderSave = () => {
    const data = model.getData();
    return (
      <Save
        onSave={this.handleOnSave}
        onClose={this.closeDialog}
        gistId={this.state.gistId}
        gistOwnerId={this.state.gistOwnerId}
        data={data} />
    );
  }
  render() {
    const data = model.getData();
    const {
      loading,
      dialog,
      updateVersion: hackKey,
      userData,
      fullscreen,
    } = this.state;
    const editor = uiModel.get().editor;
    return (
      <div className={classNames('App', `editor-${editor}`)}>
        <ServiceContext.Provider value={{
          github: this.github,
          addError: this.addError,
          addInfo: this.addInfo,
          storageManager,
          logManager: this.logManager,
          userManager: this.userManager,
          backupManager: this.backupManager,
        }}>
        <div className="content">
          <div className="top">
            <div className="left">
              <div className="name">
                <EditLine value={data.name} onChange={v => model.setName(v)} />
                {!!userData.name && <div className="username"><a target="_blank" rel="noopener noreferrer" href={`https://github.com/${userData.name}`}>{userData.name}</a></div>}
                {!!userData.avatarURL && <a target="_blank" rel="noopener noreferrer" href={`https://github.com/${userData.name}`}><img className="avatar" src={userData.avatarURL} alt="avatar"/></a>}
              </div>
            </div>
            <div className="right">
              <Toolbar toolbarFns={this.toolbarFns} fullscreen={fullscreen} />
              <Head />
            </div>
          </div>
          {
            !loading &&
              <div className="bottom">
                <IDE
                  hackKey={hackKey}
                  data={data}
                  registerRunnerAPI={this.registerRunnerAPI}
                  fullscreen={fullscreen}
                />
              </div>
          }
        </div>
        {/*
        <Footer
          gistId={gistId}
          title={data.name}
        />
        */}
        {dialog()}
        <div className="messages">
          {
            this.state.messages.map(({msg, className}, i) => (<div className={className} key={`err${i}`}>{msg}</div>))
          }
        </div>
        </ServiceContext.Provider>
      </div>
    );
  }
}

export default App;
