import App from './App'

// 引入uview-plus
import uviewPlus, { setConfig } from 'uview-plus'

// 引入全局lyCharts
import lyCharts from '@/uni_modules/ly-charts'
  
// #ifdef VUE3
import { createSSRApp } from 'vue'

export function createApp() {
  const app = createSSRApp(App)

  app.use(uviewPlus)
	.use(lyCharts, () => {
		return {
		}
	})

  return {
    app
  }
}
// #endif

