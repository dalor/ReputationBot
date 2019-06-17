const functions = require('firebase-functions');

const admin = require('firebase-admin');

const Telegraf = require('telegraf');

admin.initializeApp();

const BOT_TOKEN = functions.config().bot.token;
const bot = new Telegraf(BOT_TOKEN);

const db = admin.database();

const global_chat = db.ref('chat');

const get_value = (element, funct) => {
  return element.once('value').then((val) => {
    return funct(val.val())
  });
}

const update_user = (chat, user) => {
  chat.child('user/' + user.id).update(user);
}

const update_users = (chat, from_user, to_user) => {
  update_user(chat, from_user);
  if (to_user && from_user.id != to_user.id) {
    update_user(chat, to_user);
  }
}

const get_message = (chat, message_id, funct) => {
  return get_value(chat.child('message/' + message_id), funct);
}

const vote_types = {
  '+': {
    funct: (chat, message, user) => {
    chat.child(`message/${message}/+/${user}`).set(true);
  },
   delta: 1
  },
  '-': {
    funct: (chat, message, user) => {
    chat.child(`message/${message}/-/${user}`).set(true);
  },
  delta: -1
  }
}

const vote_to_message = (chat, reply_mess, user, val, type, funct, error) => {
  if (val) { // Voted earlier
    const vals = val[type];
    if (vals && vals[user]) { // Voted the same
      return error();
    }
    else {
      const message = chat.child('message/' + reply_mess);
      for (let vote_type in vote_types) {
        if (vote_type != type) {
          message.child(vote_type + '/' + user).set(null);
        }
      }
    }
  }
  vote_types[type].funct(chat, reply_mess, user);
  return funct();
}

const stringify_user = (user) => {
  return `${user.first_name}${user.last_name ? ' ' + user.last_name: ''}(${user.id})`;
}

const check_mess = (ctx, funct) => {
    const reply_mess = ctx.message.reply_to_message;
    const chat = global_chat.child(ctx.chat.id);
    update_users(chat, ctx.message.from, reply_mess ? reply_mess.from: null);
    if (reply_mess) {
      console.log(`${stringify_user(ctx.message.from)} -> ${stringify_user(reply_mess.from)} : ${ctx.message.text}`);
      return funct(chat, reply_mess);
    }
    // else {
    //   return ctx.reply('Reply to message');
    // }
}

const vote_user = (chat, user_id, delta) => {
  const user = chat.child('user/' + user_id + '/reputation');
  user.transaction(function (current_value) {
    return (current_value || 0) + delta;
  });
  
}

const vote = (ctx, type) => {
  return check_mess(ctx, (chat, reply_mess) => {
    return get_message(chat, reply_mess.message_id, (val) => {
      return vote_to_message(chat, reply_mess.message_id, ctx.message.from.id, val, type, () => {
        vote_user(chat, reply_mess.from.id, vote_types[type].delta);
        // return ctx.reply('OK');
      }, () => {
        // return ctx.reply('You have already voted ' + type);
      } );
    })
  })
}


bot.hears(/\/start/, (ctx) => ctx.replyWithHTML('Reply <b>+</b> or <b>-</b>'));

bot.hears(/\/help/, (ctx) => ctx.replyWithHTML('Reply <b>+</b> or <b>-</b> to message to vote author\nReply /stats to get user <i>reputation</i>'))

bot.hears(/\+/, (ctx) => {
  vote(ctx, '+');
})

bot.hears(/-/, (ctx) => {
  vote(ctx, '-');
})

bot.hears(/\/stats/, (ctx) => {
  return check_mess(ctx, (chat, reply_mess) => {
    return get_value(chat.child('user/' + reply_mess.from.id), (user) => {
      return ctx.replyWithHTML(`<a href="tg://user?id=${user.id}">${user.first_name}${user.last_name ? ' ' + user.last_name: ''}</a> reputation: <b>${user.reputation}</b>`);
    });
  })
})

const bot_url = '/reputbot/' + BOT_TOKEN

module.exports = (req, res) => {
  if (req.url == bot_url) {
    //console.log(req.body);
    bot.handleUpdate(req.body, res).then(() => {
      res.end('ok');
    })
  }
  else {
    res.end('WRONG');
  }
};