import TelegramBot from 'node-telegram-bot-api'
import { google } from 'googleapis'
import { configDotenv } from 'dotenv'
import express from 'express'

configDotenv()

const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (_, res) => res.send('Bot is running'))
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`)
})

const token = process.env.TELEGRAM_BOT_TOKEN
const bot = new TelegramBot(token, { polling: true })

const userStates = {}

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})

const sheets = google.sheets({ version: 'v4', auth })

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  userStates[chatId] = { step: 'name' }

  bot.sendPhoto(chatId, './img/intro.jpeg', {
    caption: `Доброго времени суток, ${msg.from?.first_name}👋. Первое водное крещение состоится 🐳 2 августа! Для регистрации нужно ответить на несколько вопросов 🙂
    
Укажите вашу Фамилию, Имя:`,
  })
})

bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  if (!userStates[chatId]) return

  const state = userStates[chatId]
  if (state.step === 'name') {
    state.name = msg.text
    state.step = 'dateOfBirth'

    bot.sendMessage(chatId, 'Укажите вашу дату рождения (например, 01.01.2000)')
  } else if (state.step === 'dateOfBirth') {
    state.dateOfBirth = msg.text
    state.step = 'homeGroup'

    bot.sendMessage(chatId, 'В какую домашнюю группу вы ходите?', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'на Беговой', callback_data: 'Беговая' },

            { text: 'Не посещаю', callback_data: '-' },
          ],
          [
            {
              text: 'на Б. Академической',
              callback_data: 'Большая Академическая',
            },
          ],
        ],
      },
    })
  }
})

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id
  if (query.data === '/start') {
    userStates[chatId] = { step: 'name' }
    bot.sendMessage(chatId, 'Начнем заново! Введите вашу Фамилию Имя.')
  }

  const state = userStates[chatId]
  if (!state) return

  if (state.step === 'homeGroup') {
    state.homeGroup = query.data
    state.step = 'first_visit'

    bot.sendMessage(
      chatId,
      'Сможете ли вы посетить подготовительные встречи 20 числа (после воскресного богослужения)?',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Да', callback_data: '20' },
              { text: 'Нет', callback_data: '-' },
            ],
          ],
        },
      }
    )
  } else if (state.step === 'first_visit') {
    state.visit = [query.data.toString()]
    state.step = 'second_visit'
    bot.sendMessage(
      chatId,
      'Сможете ли вы посетить подготовительные встречи 27 числа (после воскресного богослужения)?',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Да', callback_data: '27' },
              { text: 'Нет', callback_data: '-' },
            ],
          ],
        },
      }
    )
  } else if (state.step === 'second_visit') {
    state.visit = [...state.visit, query.data.toString()]
    state.step = 'question'

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_TABLE_ID,
        range: 'A1',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [
            [
              state.name,
              state.dateOfBirth,
              state.homeGroup,
              state.visit.join(', '),
            ],
          ],
        },
      })
      bot.sendMessage(
        chatId,
        `
          Спасибо! Вы успешно подали заявку на водное крещение в церкви "Благодать" (Москва, Север) 2 августа 🎉

Если у вас остались какие-либо вопросы, обращайтесь к @Maxim_Demin_S.
        `
      )
    } catch (err) {
      console.log(err)
      bot.sendMessage(chatId, 'Ошибка при сохранении данных. ', {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Начать заново', callback_data: '/start' }],
          ],
        },
      })
    }
    delete userStates[chatId]
  } else if (state.step === 'question') {
  }

  bot.answerCallbackQuery(query.id)
})
