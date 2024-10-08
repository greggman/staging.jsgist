import React from 'react';

import {classNames} from '../libs/css-utils';
import ServiceContext from '../ServiceContext.js';

function basename(url) {
  const ndx = url.lastIndexOf('/');
  return ndx >= 0 ? url.substr(ndx + 1) : url;
}

function isMsgSame(oldMsg, newMsg) {
  if (!!oldMsg !== !!newMsg) {
    return false;
  }
  const keys = Object.keys(oldMsg).filter(key => key !== 'count');
  if (keys.length !== Object.keys(newMsg).length) {
    return false;
  }
  for (const key of keys) {
    if (oldMsg[key] !== newMsg[key]) {
      return false;
    }
  }
  return true;
}

export class LogManager extends EventTarget {
  constructor() {
    super();
    this._msgs = [];
  }
  _notify() {
    this.dispatchEvent(new Event('change'));
  }
  clear = () => {
    this._msgs = [];
    this._notify();
  }
  _addMsg = (data) => {
    const lastData = this._msgs[this._msgs.length - 1];
    if (isMsgSame(lastData, data)) {
      lastData.count = (lastData.count || 0) + 1;
    } else {
      this._msgs.push(data);
    }
  }
  addMsg = (data) => {
    this._addMsg(data);
    this._notify();
  }
  addMsgs = (msgs) => {
    for (const {type, data} of msgs) {
      switch (type) {
        case 'jsError':
          this._addMsg({...data, type: 'error', showStack: true});
          break;
        case 'jsUnhandledRejection':
          this._addMsg({...data, type: 'error', showStack: true});
          break;
        default:
          this._addMsg(data);
          break;
      }
    }
    this._notify();
  }
  getMsgs() {
    return this._msgs
  }
}

export default class Log extends React.Component {
  constructor(props) {
    super(props);
    this.logMessagesRef = React.createRef();
  }
  handleChange = () => {
    this.forceUpdate();
  }
  componentDidMount() {
    const {logManager} = this.context;
    logManager.addEventListener('change', this.handleChange);
  }
  componentWillUnmount() {
    const {logManager} = this.context;
    logManager.removeEventListener('change', this.handleChange);
  }
  componentDidUpdate(prevProps, prevState, snapshot) {
    if (snapshot !== null) {
      // if we were at the bottom of the log then
      // stay at the bottom of the log
      if (snapshot < 1) {
        const elem = this.logMessagesRef.current;
        elem.scrollTop = elem.scrollHeight - elem.parentElement.clientHeight;
      }
    }
  }
  getSnapshotBeforeUpdate(prevProps, prevState) {
    const elem = this.logMessagesRef.current;
    return elem.scrollHeight - (elem.scrollTop + elem.parentElement.clientHeight);
  }
  render() {
    const {onGoToLine} = this.props;
    const {logManager} = this.context;
    return (
      <div className="logger">
        <div className="log-messages layout-scrollbar" ref={this.logMessagesRef}>
          <table><tbody>
          { logManager.getMsgs().map((msg, ndx) => {
              const tooltip = !msg.section;
              return (
                <tr className={classNames('log-line',{[msg.type]: true})} key={`l${ndx}`}>
                  <td className={msg.count ? "count" : "no-count"}>{msg.count ? msg.count : ''}</td>
                  <td className="msg">{msg.msg}</td>
                  <td
                    className={classNames('file', {tooltip, fileLink: msg.section})}
                    onClick={() => onGoToLine(msg)}
                    data-tooltip={`${msg.section || msg.url}:${msg.lineNo}`}
                  >
                    {msg.section || basename(msg.url || '')}:{msg.lineNo}
                  </td>
                </tr>
              );
            })}
          </tbody></table>
        </div>
      </div>
    );
  }
}

Log.contextType = ServiceContext;