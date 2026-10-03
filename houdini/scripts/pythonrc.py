# Startup hook for the future installed shared package. No Houdini UI calls on workers.
from qatools_licensing.houdini_ui import start_background_renewal
start_background_renewal()
