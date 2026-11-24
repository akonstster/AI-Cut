import { createContext, useContext } from 'react'

export const DocsLanguageContext = createContext<'en' | 'ru'>('en')
export const useDocsLanguage = () => useContext(DocsLanguageContext)
