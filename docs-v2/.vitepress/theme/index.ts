import DefaultTheme from 'vitepress/theme'
import './style.css'

import ReqCard from './components/ReqCard.vue'
import Note from './components/Note.vue'
import ActorCard from './components/ActorCard.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ReqCard', ReqCard)
    app.component('Note', Note)
    app.component('ActorCard', ActorCard)
  }
}
