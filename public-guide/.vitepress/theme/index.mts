import DefaultTheme from 'vitepress/theme'
import './style.css'
import Note from './Note.vue'
export default { extends: DefaultTheme, enhanceApp({ app }) { app.component('Note', Note) } }
