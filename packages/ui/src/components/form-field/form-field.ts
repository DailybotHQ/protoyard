/** Attributes FormField hands to its control; spread `props` onto any input-like element. */
export interface FormFieldControl {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  props: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': true | undefined;
    'aria-required': true | undefined;
  };
}
