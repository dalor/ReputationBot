const functions = require('firebase-functions');
const admin = require('firebase-admin');

const Telegraf = require('telegraf');

admin.initializeApp();

const BOT_TOKEN = functions.config().bot.token;
const bot = new Telegraf(BOT_TOKEN);

const db = admin.database();

const global_chat = db.ref('chat');

const get_value = (element, funct) => {
  element.once('value').then((val) => {
    funct(val.val())
  });
}

bot.start((ctx) => ctx.reply('Send + or - to vote member in chat'));

bot.help((ctx) => ctx.reply('Reply + or - to message to vote author\nReply /stats to get user reputation'))

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
  const mess = chat.child('message/' + message_id);
  get_value(mess, funct);
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
      error();
      return;
    }
    else {
      const message = chat.child('message/' + reply_mess);
      for (vote_type in vote_types) {
        if (vote_type != type) {
          message.child(vote_type + '/' + user).set(null);
        }
      }
    }
  }
  vote_types[type].funct(chat, reply_mess, user);
  funct();
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
      funct(chat, reply_mess);
    }
    else {
      ctx.reply('Reply to message');
    }
}

const vote_user = (chat, user_id, delta) => {
  const user = chat.child('user/' + user_id);
  get_value(user, (val) => {
    let reputation = val.reputation;
    reputation = reputation ? reputation + delta: delta;
    user.update({reputation: reputation});
  })
}

const vote = (ctx, type) => {
  check_mess(ctx, (chat, reply_mess) => {
    get_message(chat, reply_mess.message_id, (val) => {
      vote_to_message(chat, reply_mess.message_id, ctx.message.from.id, val, type, () => {
        vote_user(chat, reply_mess.from.id, vote_types[type].delta);
        ctx.reply('OK');
      }, () => {
        ctx.reply('You have already voted ' + type);
      } );
    })
  })
}

bot.hears(/\+/, (ctx) => {
  vote(ctx, '+');
})

bot.hears(/\-/, (ctx) => {
  vote(ctx, '-');
})

bot.hears(/\/stats/, (ctx) => {
  check_mess(ctx, (chat, reply_mess) => {
    get_value(chat.child('user/' + reply_mess.from.id), (val) => {
      ctx.reply(`${val.first_name} reputation: ${val.reputation}`);
    });
  })
})

exports.bot = functions.https.onRequest((req, res) => {
  bot.handleUpdate(req.body, res);
});