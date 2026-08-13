import { StatusBar } from 'react-native'
import { MobileNavigator } from './src/mobile/navigation/MobileNavigator'

export default function App() {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f7efe5" />
      <MobileNavigator />
    </>
  )
}
