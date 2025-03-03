
class SwarmIntAdd:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "a": ("INT", {"default": 0, "min": -2147483647, "max": 2147483647}),
                "b": ("INT", {"default": 0, "min": -2147483647, "max": 2147483647})
            }
        }

    CATEGORY = "SwarmUI/math"
    RETURN_TYPES = ("INT",)
    FUNCTION = "add"
    DESCRIPTION = "Adds two integers. Use a negative number to subtract."

    def add(self, a, b):
        return (a + b,)


NODE_CLASS_MAPPINGS = {
    "SwarmIntAdd": SwarmIntAdd
}
