import { createSlice } from "@reduxjs/toolkit";

const authSlice = createSlice({
	name: "auth",
	initialState: null,
	reducers: {
		addAuth: (state, action) => {
			return action.payload;
		},
		removeAuth: () => {
			return null;
		},
	},
});
export const { addAuth, removeAuth } = authSlice.actions;
export default authSlice.reducer;
