import { InformationCircleIcon } from '@heroicons/react/outline'

export function InfoTooltip(props: { text: string }) {
  const { text } = props
  return (
    <div className="tooltip tooltip-right max-w-0" data-tip={text}>
      <InformationCircleIcon className="h-5 w-5 text-gray-500" />
    </div>
  )
}
