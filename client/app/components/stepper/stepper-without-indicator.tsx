import type { FC, ReactNode } from "react"

type StepContentProps = {
  currentStep: number
  stepNumber: number
  children: ReactNode
}

const StepperWithoutIndicator: FC<StepContentProps> = ({
  currentStep,
  stepNumber,
  children,
}) => {
  if (currentStep !== stepNumber) {
    return null
  }

  return <>{children}</>
}

export default StepperWithoutIndicator
