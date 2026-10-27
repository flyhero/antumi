import Markdown, { type Components } from 'react-markdown'
import zh from '../../../../../../docs/branding/pets/creating-your-pet.md?raw'
import en from '../../../../../../docs/branding/pets/creating-your-pet.en.md?raw'
import { t, useLocale } from '../i18n'
import { remarkPlugins } from '../markdown-syntax'
import { CopyButton } from './CopyButton'
import { ChevronRightIcon } from './icons'

const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />
}

export function PetCreationGuide() {
  const locale = useLocale((s) => s.locale)
  const guide = locale === 'en' ? en : zh
  return (
    <details className="pet-creation-guide">
      <summary>
        <span className="pet-creation-heading">
          <span className="pet-creation-title">{t('Pet.createYourOwn')}</span>
          <span className="pet-creation-description">{t('Pet.creationDescription')}</span>
        </span>
        <ChevronRightIcon />
      </summary>
      <div className="pet-creation-content">
        <div className="pet-creation-actions"><CopyButton text={guide} label={t('Pet.copyCreationGuide')}>{t('Pet.copyCreationGuide')}</CopyButton></div>
        <div className="chat-markdown pet-creation-body">
          <Markdown remarkPlugins={remarkPlugins} components={components}>{guide.replace(/^# .+\n+/, '')}</Markdown>
        </div>
      </div>
    </details>
  )
}
